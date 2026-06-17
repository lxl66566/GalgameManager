//! Linux game-launch tracking.
//!
//! Replaces the simple "wait on a child process" model with one that can
//! take advantage of systemd transient scopes for robust process-tree
//! tracking, plus an extensible foreground-window detector chain (X11 +
//! AT-SPI today; GNOME/KDE IPC tomorrow).
//!
//! The public surface (`launch_game`, `game_loop`, `GameLaunchRes`)
//! mirrors [`crate::exec::windows`] so the rest of `exec::mod` stays
//! platform-agnostic.

mod foreground;
mod spawn;

use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

use chrono::TimeDelta;
use log::{error, info, warn};
use tauri::{AppHandle, Emitter as _};
use tokio::{sync::oneshot, time};

use super::StartCtx;
use crate::{
    db::CONFIG,
    error::{Error, Result},
};

/// How often the foreground state is sampled while a game is running.
const POLL_INTERVAL: Duration = Duration::from_secs(1);
/// Persist accumulated play time at least every minute.
const SAVE_INTERVAL: TimeDelta = TimeDelta::seconds(60);
/// When using the [`GameTracker::SystemdUnit`] fallback, throttle the
/// (sync, subprocess-driven) liveness check to once per N polls.
const UNIT_LIVENESS_CACHE: Duration = Duration::from_secs(5);

/// Tracking strategy chosen at launch time.
///
/// * `Systemd` — preferred when a user systemd session is available. We spawn
///   the game inside a transient scope via `systemd-run --user --scope
///   --no-block`, then poll the scope's `cgroup.procs` to know whether the
///   game is still running and whether the focused window belongs to it.
///
/// * `SystemdUnit` — degraded systemd path. The scope was created but its
///   cgroup could not be resolved (e.g. empty `ControlGroup` property on
///   some systemd versions). We poll `systemctl --user is-active` instead.
///   Process-identity focus matching is unavailable, so in precision mode
///   any foreground window counts as focused.
///
/// * `Child` — fallback for systems without systemd (or when spawning the
///   scope fails). Behaves like the legacy unix implementation.
pub enum GameTracker {
    Systemd { procs_path: PathBuf },
    SystemdUnit {
        unit: String,
        last_check: Instant,
        cached: bool,
    },
    Child { child: tokio::process::Child },
}

impl GameTracker {
    /// Returns `true` if the tracked process tree still has live members.
    pub fn has_active_processes(&mut self) -> bool {
        match self {
            Self::Systemd { procs_path } => read_procs(procs_path)
                .map(|pids| !pids.is_empty())
                .unwrap_or(false),
            Self::SystemdUnit {
                unit,
                last_check,
                cached,
            } => {
                let now = Instant::now();
                if now.duration_since(*last_check) >= UNIT_LIVENESS_CACHE {
                    *last_check = now;
                    *cached = systemctl_unit_is_active(unit);
                }
                *cached
            }
            Self::Child { child } => match child.try_wait() {
                Ok(Some(_)) => false,
                Ok(None) => true,
                Err(_) => false,
            },
        }
    }

    /// Returns `true` if the currently focused window is owned by one of
    /// the processes in this tracker.
    pub fn is_focused(&self) -> bool {
        match self {
            Self::Systemd { procs_path } => {
                let Some(pid) = foreground::shared().focused_pid() else {
                    return false;
                };
                read_procs(procs_path)
                    .map(|pids| pids.contains(&pid))
                    .unwrap_or(false)
            }
            // No process list available — assume focus so playtime
            // accumulates. Precision mode may over-count when the user
            // switches away, but that is acceptable for this fallback.
            Self::SystemdUnit { .. } => foreground::shared().focused_pid().is_some(),
            // The fallback child path only tracks the launcher PID. Many
            // galgames fork helpers or wrappers; if so, this may report
            // false negatives. That's an acceptable trade-off for the
            // non-systemd path — install systemd for accurate tracking.
            Self::Child { child } => child.id() == foreground::shared().focused_pid(),
        }
    }
}

/// Read every PID listed in a `cgroup.procs` file. Missing file or read
/// errors are propagated so the caller can decide on a fallback.
fn read_procs(path: &std::path::Path) -> std::io::Result<Vec<u32>> {
    let raw = std::fs::read_to_string(path)?;
    let mut out = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(pid) = line.parse::<u32>() {
            out.push(pid);
        }
    }
    Ok(out)
}

/// Quick liveness check for a user systemd unit. Synchronous because it
/// is called from the (sync) `has_active_processes` and is throttled by
/// [`UNIT_LIVENESS_CACHE`] in the caller.
fn systemctl_unit_is_active(unit: &str) -> bool {
    std::process::Command::new("systemctl")
        .args(["--user", "is-active", "--quiet", unit])
        // Suppress noise: a dead unit prints "inactive" to stdout and
        // exits non-zero, which is the expected "no" answer here.
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub type GameLaunchRes = GameTracker;

pub async fn launch_game(
    game_id: u32,
    app: AppHandle,
    game_start_sender: oneshot::Sender<()>,
    start_ctx: StartCtx,
) -> Result<GameLaunchRes> {
    // Always initialize the foreground detector early so its X11/AT-SPI
    // listeners warm up concurrently with the game launching.
    foreground::shared();

    // Prefer a transient systemd scope: it lets us follow the whole
    // process tree without help from the spawned binary, and survives
    // intermediate wrappers (LocaleEmulator, translator hooks, ...).
    //
    // Fallback to a direct child only when systemd-run itself can't be
    // invoked (`Error::Io`); any other failure (executable not found,
    // invalid env, scope creation refused by systemd, ...) is surfaced
    // to the user. Otherwise a broken launch would log one warning from
    // systemd-run *and* a second error from the direct spawn fallback,
    // hiding the real cause.
    let tracker = if spawn::has_systemd_user() {
        let unit = format!(
            "galgame-manager-{game_id}-{pid}.scope",
            pid = std::process::id()
        );
        match spawn::spawn_in_scope(&start_ctx, &unit).await {
            Ok(Some(procs_path)) => {
                info!("Game spawned via systemd scope: {unit}");
                GameTracker::Systemd { procs_path }
            }
            Ok(None) => {
                info!(
                    "Game spawned via systemd scope: {unit} (cgroup tracking unavailable; \
                     using unit-liveness polling)"
                );
                GameTracker::SystemdUnit {
                    unit,
                    last_check: Instant::now(),
                    cached: true,
                }
            }
            Err(Error::Io(e)) => {
                warn!("systemd-run invocation failed ({e}); falling back to direct spawn");
                let child = start_ctx.build_async_command()?.spawn()?;
                GameTracker::Child { child }
            }
            Err(e) => return Err(e),
        }
    } else {
        let child = start_ctx.build_async_command()?.spawn()?;
        GameTracker::Child { child }
    };

    app.emit(&format!("game://spawn/{game_id}"), ())?;
    game_start_sender
        .send(())
        .map_err(|_| Error::InvalidChannel("game_start_sender"))?;

    Ok(tracker)
}

pub async fn game_loop(
    mut tracker: GameLaunchRes,
    game_id: u32,
    app: AppHandle,
    game_exit_sender: oneshot::Sender<()>,
) -> Result<()> {
    let mut interval = time::interval(POLL_INTERVAL);
    let mut last_time_saved = chrono::Utc::now();
    let mut time_counter = TimeDelta::milliseconds(0);
    let precision_mode = CONFIG.lock().settings.launch.precision_mode;

    // First tick fires immediately; skip so we don't double-count.
    interval.tick().await;

    loop {
        interval.tick().await;

        if !tracker.has_active_processes() {
            info!("Game exited: game_id={game_id}");
            app.emit(&format!("game://exit/{game_id}"), true)?;
            super::update_game_time(&app, game_id, time_counter)?;
            game_exit_sender
                .send(())
                .map_err(|_| Error::InvalidChannel("game_exit_sender"))?;
            break Ok(());
        }

        let now = chrono::Utc::now();
        // Without precision mode, count all elapsed time; otherwise only
        // count when the game (or one of its child processes) is focused.
        if !precision_mode || tracker.is_focused() {
            time_counter += now - last_time_saved;
        }
        last_time_saved = now;

        if time_counter >= SAVE_INTERVAL {
            if let Err(e) = super::update_game_time(&app, game_id, time_counter) {
                error!("update_game_time failed: {e}");
            }
            time_counter = TimeDelta::milliseconds(0);
        }
    }
}

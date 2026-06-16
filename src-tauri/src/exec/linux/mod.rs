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

use std::path::PathBuf;
use std::time::Duration;

use chrono::TimeDelta;
use log::{error, info, warn};
use tauri::{AppHandle, Emitter as _};
use tokio::{sync::oneshot, time};

use crate::{
    db::CONFIG,
    error::{Error, Result},
};

use super::StartCtx;

/// How often the foreground state is sampled while a game is running.
const POLL_INTERVAL: Duration = Duration::from_secs(1);
/// Persist accumulated play time at least every minute.
const SAVE_INTERVAL: TimeDelta = TimeDelta::seconds(60);

/// Tracking strategy chosen at launch time.
///
/// * `Systemd` — preferred when a user systemd session is available. We
///   spawn the game inside a transient scope via `systemd-run --user
///   --scope --no-block`, then poll the scope's `cgroup.procs` to know
///   whether the game is still running and whether the focused window
///   belongs to it.
///
/// * `Child` — fallback for systems without systemd (or when spawning
///   the scope fails). Behaves like the legacy unix implementation.
pub enum GameTracker {
    Systemd { procs_path: PathBuf },
    Child { child: tokio::process::Child },
}

impl GameTracker {
    /// Returns `true` if the tracked process tree still has live members.
    pub fn has_active_processes(&mut self) -> bool {
        match self {
            Self::Systemd { procs_path } => read_procs(procs_path)
                .map(|pids| !pids.is_empty())
                .unwrap_or(false),
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
        let Some(pid) = foreground::shared().focused_pid() else {
            return false;
        };
        match self {
            Self::Systemd { procs_path } => read_procs(procs_path)
                .map(|pids| pids.contains(&pid))
                .unwrap_or(false),
            // The fallback child path only tracks the launcher PID. Many
            // galgames fork helpers or wrappers; if so, this may report
            // false negatives. That's an acceptable trade-off for the
            // non-systemd path — install systemd for accurate tracking.
            Self::Child { child } => child.id() == Some(pid),
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
    let tracker = if spawn::has_systemd_user() {
        let unit = format!(
            "galgame-manager-{game_id}-{pid}.scope",
            pid = std::process::id()
        );
        match spawn::spawn_in_scope(&start_ctx, &unit).await {
            Ok(procs_path) => {
                info!("Game spawned via systemd scope: {unit}");
                GameTracker::Systemd { procs_path }
            }
            Err(e) => {
                warn!("systemd-run failed ({e}); falling back to direct spawn");
                let child = start_ctx.build_async_command()?.spawn()?;
                GameTracker::Child { child }
            }
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

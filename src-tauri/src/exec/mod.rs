use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::{Arc, LazyLock as Lazy},
};

use dashmap::DashMap;
use log::{debug, info, warn};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, async_runtime::JoinHandle};
use tokio::sync::oneshot;
use ts_rs::TS;

use crate::{
    db::CONFIG,
    error::{Error, Result},
    plugin::{LaunchCtx, PluginConfig, Transaction, enabled_plugin_contexts, instance_config},
};

#[cfg(all(unix, not(target_os = "linux")))]
mod unix;
#[cfg(all(unix, not(target_os = "linux")))]
pub use unix::*;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::*;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::{GameLaunchRes, game_loop, launch_game, launch_game_steam};

// Steam launches are Windows-only for now (native Linux Steam + Proton has
// a different library/process model); the seam lives here so a future Linux
// implementation only has to provide this one function.
#[cfg(not(windows))]
// Signature must match the windows variant so call sites can `.await` it
// identically; the stub never awaits.
#[allow(clippy::unused_async)]
async fn launch_game_steam(
    _game_id: u32,
    _app: AppHandle,
    _game_start_sender: oneshot::Sender<()>,
    _appid: u32,
    _install_dir: PathBuf,
) -> Result<GameLaunchRes> {
    Err(Error::Steam(crate::steam::SteamError::UnsupportedPlatform))
}

pub(crate) static GAME_LOOP_HANDLES: Lazy<DashMap<u32, JoinHandle<Result<()>>>> =
    Lazy::new(DashMap::new);

/// Whether a game session (spawned game loop) is still active.
pub fn is_game_running(game_id: u32) -> bool {
    GAME_LOOP_HANDLES
        .get(&game_id)
        .is_some_and(|h| !h.inner().is_finished())
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
pub struct StartCtx {
    pub cmd: String,
    pub current_dir: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

/// Payload emitted with `game://exit/{id}`.
#[derive(Debug, Clone, Serialize)]
pub struct GameExitPayload {
    pub success: bool,
    /// Session duration in seconds (respects precision mode when enabled).
    pub session_secs: u64,
}

/// Consecutive `cgroup.procs` read failures tolerated before the game is
/// considered exited. Kept platform-independent (test-gated off Linux) so
/// the liveness logic is unit-testable on any dev machine.
#[cfg(any(target_os = "linux", test))]
const MAX_CGROUP_READ_FAILURES: u32 = 3;

/// Fold one `cgroup.procs` read into a liveness decision, tolerating
/// transient cgroupfs read errors (the file can briefly fail while the
/// scope is being torn down or the cgroup is migrating). A successful read
/// is authoritative — an empty PID list means the scope is really dead and
/// resets the failure streak; a read error only ends the session after
/// [`MAX_CGROUP_READ_FAILURES`] consecutive failures, otherwise the
/// previous "alive" state is kept.
#[cfg(any(target_os = "linux", test))]
fn fold_cgroup_liveness(read: std::io::Result<Vec<u32>>, failures: &mut u32) -> bool {
    if let Ok(pids) = read {
        *failures = 0;
        !pids.is_empty()
    } else {
        *failures += 1;
        *failures < MAX_CGROUP_READ_FAILURES
    }
}

/// Interpret the `Result=` property value of a finished systemd scope.
/// `success` (and only it) means clean; `exit-code` / `signal` /
/// `core-dump` / ... mean abnormal. An *empty* value means the unit was
/// already garbage-collected — and systemd keeps failed units for
/// inspection, so a collected scope had exited cleanly. Kept
/// platform-independent (test-gated off Linux) for unit-testability.
#[cfg(any(target_os = "linux", test))]
fn unit_result_is_clean(result: &str) -> bool {
    let result = result.trim();
    result.is_empty() || result == "success"
}

use std::fmt;

impl fmt::Display for StartCtx {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "cmd='{}', current_dir={:?}, env={:?}",
            self.cmd, self.current_dir, self.env
        )
    }
}

impl StartCtx {
    /// Resolved pieces of a [`StartCtx`]: the executable, its
    /// positional args, an optional working directory, and an optional
    /// environment overlay. Factored into a tuple so alternative
    /// launchers (e.g. `systemd-run`) can reuse the same resolution
    /// logic without rebuilding a [`std::process::Command`].
    pub fn resolved_parts(&self) -> Result<ResolvedParts> {
        let mut parts = shlex::split(&self.cmd)
            .ok_or_else(|| Error::InvalidCommand(self.cmd.clone()))?
            .into_iter();

        let program = parts
            .next()
            .ok_or_else(|| Error::InvalidCommand(self.cmd.clone()))?;

        let args: Vec<String> = parts.collect();
        let program_path = PathBuf::from(&program);

        // A "bare" command name contains no path separator (e.g. `wine`,
        // `LEProc.exe`). It is meant to be looked up on `$PATH` and must
        // NOT be joined with `current_dir` — otherwise `wine` next to a
        // game exe gets mis-resolved to `<game_dir>/wine`. Only relative
        // paths that contain a separator (`./foo`, `subdir/foo`) are
        // joined with `current_dir`.
        let has_path_sep = program.contains('/') || program.contains('\\');
        let (resolved_program, resolved_current_dir) = if program_path.is_absolute() {
            // Absolute: infer current_dir from the exe's parent if unset
            let cd = self.current_dir.clone().or_else(|| {
                program_path
                    .parent()
                    .filter(|p| !p.as_os_str().is_empty())
                    .map(|p| p.to_string_lossy().to_string())
            });
            (program_path, cd)
        } else if has_path_sep {
            if let Some(cd) = &self.current_dir {
                // Relative + current_dir: join into an absolute path the OS can find
                let joined = Path::new(cd).join(&program_path);
                debug!(
                    "Relative program '{}' specified with current_dir '{}', joined to '{}'",
                    program,
                    cd,
                    joined.display()
                );
                (joined, Some(cd.clone()))
            } else {
                warn!(
                    "Relative program '{program}' specified without a working directory; the OS \
                     will search in PATH and the process CWD"
                );
                (program_path, None)
            }
        } else {
            // Bare command name: PATH lookup. `current_dir` (if any) is
            // still passed through as the process working directory.
            (program_path, self.current_dir.clone())
        };

        Ok(ResolvedParts {
            program: resolved_program,
            args,
            current_dir: resolved_current_dir,
            env: self.env.clone(),
        })
    }

    pub fn build_command(&self) -> Result<Command> {
        let parts = self.resolved_parts()?;

        let mut cmd = Command::new(parts.program);

        for arg in parts.args {
            cmd.arg(arg);
        }

        if let Some(cd) = parts.current_dir {
            cmd.current_dir(cd);
        }

        if let Some(env) = parts.env {
            for (k, v) in env {
                cmd.env(k, v);
            }
        }

        Ok(cmd)
    }

    pub fn spawn(&self) -> Result<Child> {
        let mut cmd = self.build_command()?;
        Ok(cmd.spawn()?)
    }

    /// Build a [`tokio::process::Command`] from this context.
    pub fn build_async_command(&self) -> Result<tokio::process::Command> {
        let std_cmd = self.build_command()?;
        Ok(tokio::process::Command::from(std_cmd))
    }
}

/// Owned, fully-resolved view of a [`StartCtx`] used by alternative
/// launchers (e.g. `systemd-run`) that need the program/args/cwd/env
/// as plain values instead of a [`Command`].
#[derive(Debug)]
pub struct ResolvedParts {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub current_dir: Option<String>,
    pub env: Option<HashMap<String, String>>,
}
pub async fn launch_game_with_plugins(app: AppHandle, game_id: u32) -> Result<()> {
    let (plugins, metas, exe_path, current_dir, steam_launch) = {
        let lock = CONFIG.lock();
        let game = lock.get_game_by_id(game_id)?;
        // Steam games launch through the steam:// protocol; their exe/dir
        // resolve from the live Steam library (snapshot fallback) so plugins
        // still get a real deploy target for DLL side-loading.
        let (exe, current_dir, steam_launch) = if let Some(steam) = &game.steam {
            let paths = crate::steam::resolve_launch_paths(&lock, &game.name, steam)?;
            let launch = Some((steam.appid, paths.install_dir));
            (Some(paths.exe_path), paths.current_dir, launch)
        } else {
            let exe = match &game.excutable_path {
                Some(p) => Some(lock.resolve_var(p)?),
                None => None,
            };
            let current_dir = exe
                .as_ref()
                .and_then(|p| Path::new(p).parent())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            (exe, current_dir, None)
        };
        (
            game.plugins.clone(),
            lock.plugin_metadatas.clone(),
            exe,
            current_dir,
            steam_launch,
        )
    };

    let exe_path = exe_path.ok_or(Error::Launch)?;
    let plugins = Arc::new(plugins);
    let metas = Arc::new(metas);

    let configs: Vec<Arc<PluginConfig>> = plugins
        .iter()
        .map(|i| Arc::new(instance_config(i)))
        .collect();
    let configs = Arc::new(configs);

    let launch = Arc::new(LaunchCtx {
        app,
        game_id,
        exe_path,
        current_dir,
        transaction: Transaction::new(),
        env_overlay: Mutex::new(HashMap::new()),
        dll_override_overlay: Mutex::new(HashMap::new()),
    });

    // 1. before_game_start hooks
    for (handler_key, handler, ctx) in enabled_plugin_contexts(&plugins, &configs, &metas, &launch)
    {
        if let Err(e) = handler.before_game_start(ctx).await {
            log::error!("Plugin '{handler_key}' before_game_start failed: {e}");
            launch.transaction.rollback();
            return Err(e);
        }
    }

    // 2. get_launch_override hooks — skipped for Steam games: override plugins (GameWrapper /
    //    LocaleEmulator / Wine) replace the command line with a direct exe launch, which trips
    //    Steam's ticket/DRM validation. The before/after hooks above still run — speedup-style DLL
    //    side-loading is parent-agnostic and keeps working.
    let start_ctx = if steam_launch.is_none() {
        let mut launch_override = None;
        for (handler_key, handler, ctx) in
            enabled_plugin_contexts(&plugins, &configs, &metas, &launch)
        {
            match handler.get_launch_override(&ctx) {
                Ok(Some(override_ctx)) => {
                    launch_override = Some(override_ctx);
                    break;
                },
                Ok(None) => {},
                Err(e) => {
                    // Same as a before_game_start failure: without the rollback,
                    // everything the earlier hooks registered (extracted DLLs,
                    // user-level SPEEDUP env var, MMDevAPI registry redirect)
                    // would leak permanently.
                    log::error!("Plugin '{handler_key}' get_launch_override failed: {e}");
                    launch.transaction.rollback();
                    return Err(e);
                },
            }
        }

        if let Some(ctx) = launch_override {
            Some(ctx)
        } else {
            let current_dir = if launch.current_dir.is_empty() {
                None
            } else {
                Some(launch.current_dir.clone())
            };
            let exe = Path::new(&launch.exe_path);
            if exe.is_relative() && current_dir.is_none() {
                warn!(
                    "Game executable '{}' is relative without a resolvable parent directory...",
                    launch.exe_path
                );
            }
            Some(StartCtx {
                cmd: match shlex::try_quote(&launch.exe_path) {
                    Ok(quoted) => quoted.into_owned(),
                    Err(_) => launch.exe_path.clone(),
                },
                current_dir,
                env: None,
            })
        }
    } else {
        None
    };

    let (game_start_tx, game_start_rx) = oneshot::channel();
    let (game_exit_tx, game_exit_rx) = oneshot::channel();

    // 3. after_game_start task
    let launch_start = launch.clone();
    let plugins_start = plugins.clone();
    let configs_start = configs.clone();
    let metas_start = metas.clone();
    let start_res = tauri::async_runtime::spawn(async move {
        let rx_res = game_start_rx.await;
        if rx_res.is_ok() {
            for (handler_key, handler, ctx) in
                enabled_plugin_contexts(&plugins_start, &configs_start, &metas_start, &launch_start)
            {
                if let Err(e) = handler.after_game_start(ctx).await {
                    log::error!("Plugin '{handler_key}' after_game_start failed: {e}");
                }
            }
        }
        launch_start.transaction.execute_after_start();
        rx_res.map_err(|_| Error::InvalidChannel("game_start_rx"))
    });

    // 4. after_game_exit task
    let launch_exit = launch.clone();
    let plugins_exit = plugins.clone();
    let configs_exit = configs.clone();
    let metas_exit = metas.clone();
    let exit_res = tauri::async_runtime::spawn(async move {
        let rx_res = game_exit_rx.await;
        if rx_res.is_ok() {
            for (handler_key, handler, ctx) in
                enabled_plugin_contexts(&plugins_exit, &configs_exit, &metas_exit, &launch_exit)
            {
                if let Err(e) = handler.after_game_exit(ctx).await {
                    log::error!("Plugin '{handler_key}' after_game_exit failed: {e}");
                }
            }
        }
        launch_exit.transaction.execute_after_exit();
        rx_res.map_err(|_| Error::InvalidChannel("game_exit_rx"))
    });

    let res = if let Some((appid, install_dir)) = steam_launch {
        info!(
            "launch_game via steam: appid={appid}, install_dir={}",
            install_dir.display()
        );
        launch_game_steam(
            game_id,
            launch.app.clone(),
            game_start_tx,
            appid,
            install_dir,
        )
        .await
    } else {
        // steam path consumes start_ctx above; non-steam always has one
        let start_ctx = start_ctx.expect("non-steam launch always builds a StartCtx");
        info!("launch_game with StartCtx: {start_ctx}");
        launch_game(game_id, launch.app.clone(), game_start_tx, start_ctx).await
    };

    // The game process itself failed to spawn: roll back immediately
    let res = match res {
        Ok(r) => r,
        Err(e) => {
            launch.transaction.rollback();
            return Err(e);
        },
    };

    let app_for_loop = launch.app.clone();
    let handle = tauri::async_runtime::spawn(async move {
        game_loop(res, game_id, app_for_loop, game_exit_tx).await
    });
    _ = GAME_LOOP_HANDLES.insert(game_id, handle);

    if let Err(e) = start_res.await? {
        log::error!("start_res error: {e}");
    }
    if let Err(e) = exit_res.await? {
        log::error!("exit_res error: {e}");
    }

    GAME_LOOP_HANDLES.remove(&game_id);
    Ok(())
}

fn update_game_time(
    app: &AppHandle,
    game_id: u32,
    dur: chrono::TimeDelta,
    force: bool,
) -> Result<()> {
    let mut lock = CONFIG.lock();
    // Read the toggle before mutably borrowing a game to avoid a borrow clash
    // (settings and games both live on the same Config).
    let daily_stat = lock.settings.launch.daily_stat;
    let game = lock.get_game_by_id_mut(game_id)?;
    game.use_time += dur;
    game.last_played_time = Some(chrono::Utc::now());
    // Daily playtime is accumulated here so it is flushed to disk together
    // with use_time on every periodic save. A crash therefore loses at most
    // one SAVE_INTERVAL window for BOTH counters, instead of the whole daily
    // session (which used to be recorded only on graceful exit).
    if daily_stat {
        // .max(0) guarantees non-negative; game sessions never approach u32 max.
        #[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]
        let secs = dur.num_seconds().max(0) as u32;
        if secs > 0 {
            // Bucket by the user's *local* calendar day, not UTC, so an
            // evening session lands on "today" from the player's viewpoint.
            // The frontend chart uses the same local-day key.
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();
            *game.daily_playtime.entry(today).or_insert(0) += secs;
        }
    }
    log::info!(
        "update use_time: game_id={}, use_time updated to {}",
        game_id,
        game.use_time
    );
    // Periodic ticks are throttled by the writer (one disk write per
    // MIN_INTERVAL); game exit is forced so the final session chunk is
    // never lost to the throttle window.
    if force {
        lock.force_save_and_emit(app)
    } else {
        lock.save_and_emit(app)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_cmd_is_invalid() {
        // shlex::split returns None on unbalanced quotes, but for "" we get
        // an empty iter → InvalidCommand error.
        let err = StartCtx {
            cmd: String::new(),
            ..Default::default()
        }
        .resolved_parts()
        .unwrap_err();
        assert!(matches!(err, Error::InvalidCommand(_)));
    }

    #[test]
    fn absolute_program_infers_current_dir_from_parent() {
        // Use forward-slash absolute paths so shlex doesn't strip backslashes
        // (shlex treats `\` as an escape). On Windows, `C:/...` is still
        // considered absolute by Path::is_absolute.
        let abs = if cfg!(windows) {
            "C:/usr/bin/foo.exe"
        } else {
            "/usr/bin/foo"
        };
        let ctx = StartCtx {
            cmd: format!("{abs} --bar baz"),
            current_dir: None,
            env: None,
        };
        let parts = ctx.resolved_parts().unwrap();
        assert_eq!(parts.program, PathBuf::from(abs));
        assert_eq!(parts.args, vec!["--bar".to_string(), "baz".to_string()]);
        let parent = PathBuf::from(abs);
        let expected_parent = parent.parent().unwrap();
        assert_eq!(
            parts.current_dir.as_deref().map(Path::new),
            Some(expected_parent)
        );
    }

    #[test]
    fn explicit_current_dir_overrides_parent_inference() {
        let abs = if cfg!(windows) {
            "C:/usr/bin/foo.exe"
        } else {
            "/usr/bin/foo"
        };
        let cwd = if cfg!(windows) {
            "C:/cwd"
        } else {
            "/cwd"
        };
        let ctx = StartCtx {
            cmd: abs.to_string(),
            current_dir: Some(cwd.to_string()),
            env: None,
        };
        let parts = ctx.resolved_parts().unwrap();
        // The program stays absolute; only cwd changes.
        assert_eq!(parts.program, PathBuf::from(abs));
        assert_eq!(parts.current_dir.as_deref(), Some(cwd));
    }

    #[test]
    fn bare_command_keeps_current_dir_as_is() {
        // Bare name (no path separator) must NOT be joined with current_dir —
        // otherwise `wine` next to a game exe would be mis-resolved to
        // `<game_dir>/wine`. Regression test for that historical bug.
        let cwd = if cfg!(windows) {
            "C:/games/foo"
        } else {
            "/games/foo"
        };
        let ctx = StartCtx {
            cmd: "wine notepad".to_string(),
            current_dir: Some(cwd.to_string()),
            env: None,
        };
        let parts = ctx.resolved_parts().unwrap();
        assert_eq!(parts.program, PathBuf::from("wine"));
        assert_eq!(parts.args, vec!["notepad".to_string()]);
        assert_eq!(parts.current_dir.as_deref(), Some(cwd));
    }

    #[test]
    fn relative_program_with_cd_is_joined() {
        // A relative path that contains a separator (./foo or subdir/foo)
        // must be resolved against current_dir to a fully-qualified path.
        let cwd = if cfg!(windows) {
            "C:/parent"
        } else {
            "/parent"
        };
        let ctx = StartCtx {
            cmd: "./helper --x".to_string(),
            current_dir: Some(cwd.to_string()),
            env: None,
        };
        let parts = ctx.resolved_parts().unwrap();
        let expected = Path::new(cwd).join("./helper");
        assert_eq!(parts.program, expected);
        assert_eq!(parts.current_dir.as_deref(), Some(cwd));
    }

    #[test]
    fn empty_args_when_program_only() {
        // No arg parsing surprises: a single-token cmd yields empty args
        // and the program is preserved verbatim.
        let ctx = StartCtx {
            cmd: "foo".to_string(),
            current_dir: None,
            env: None,
        };
        let parts = ctx.resolved_parts().unwrap();
        assert_eq!(parts.program, PathBuf::from("foo"));
        assert_eq!(parts.args, [] as [String; 0]);
        assert!(parts.current_dir.is_none());
        assert!(parts.env.is_none());
    }

    #[test]
    fn unbalanced_quote_in_cmd_errors() {
        let err = StartCtx {
            cmd: r"echo 'broken".to_string(),
            ..Default::default()
        }
        .resolved_parts()
        .unwrap_err();
        assert!(matches!(err, Error::InvalidCommand(_)));
    }

    #[test]
    fn cgroup_transient_read_errors_keep_alive_until_threshold() {
        let err = || std::io::Error::other("boom");
        let mut failures = 0;
        // Below the threshold the previous "alive" state is kept.
        assert!(fold_cgroup_liveness(Err(err()), &mut failures));
        assert!(fold_cgroup_liveness(Err(err()), &mut failures));
        // Third consecutive failure declares the game exited.
        assert!(!fold_cgroup_liveness(Err(err()), &mut failures));
        assert_eq!(failures, MAX_CGROUP_READ_FAILURES);
    }

    #[test]
    fn cgroup_empty_pid_list_is_dead_immediately() {
        let mut failures = 0;
        // A successful read is authoritative: no PIDs ⇒ scope is gone, even
        // on the very first poll.
        assert!(!fold_cgroup_liveness(Ok(vec![]), &mut failures));
    }

    #[test]
    fn cgroup_successful_read_resets_failure_streak() {
        let err = || std::io::Error::other("boom");
        let mut failures = 0;
        assert!(fold_cgroup_liveness(Err(err()), &mut failures));
        assert!(fold_cgroup_liveness(Err(err()), &mut failures));
        // One good read with live PIDs resets the streak ...
        assert!(fold_cgroup_liveness(Ok(vec![1234]), &mut failures));
        assert_eq!(failures, 0);
        // ... so it takes another full streak to declare exit.
        assert!(fold_cgroup_liveness(Err(err()), &mut failures));
        assert!(fold_cgroup_liveness(Err(err()), &mut failures));
        assert!(!fold_cgroup_liveness(Err(err()), &mut failures));
    }

    #[test]
    fn unit_result_clean_only_for_success_or_collected_unit() {
        assert!(unit_result_is_clean("success"));
        // systemctl --value output keeps a trailing newline.
        assert!(unit_result_is_clean(" success\n"));
        // Empty output ⇒ unit garbage-collected ⇒ was not failed ⇒ clean.
        assert!(unit_result_is_clean(""));
        for abnormal in ["exit-code", "signal", "core-dump", "timeout", "oom-kill"] {
            assert!(!unit_result_is_clean(abnormal), "{abnormal}");
        }
    }
}

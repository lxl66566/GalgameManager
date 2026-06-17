use std::{
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::{Arc, LazyLock as Lazy},
};

use dashmap::DashMap;
use log::{debug, info, warn};
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
pub use windows::*;

pub(crate) static GAME_LOOP_HANDLES: Lazy<DashMap<u32, JoinHandle<Result<()>>>> =
    Lazy::new(DashMap::new);

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
pub struct StartCtx {
    pub cmd: String,
    pub current_dir: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
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
            // 绝对路径：如果没有 current_dir，则从它的父目录推断
            let cd = self.current_dir.clone().or_else(|| {
                program_path
                    .parent()
                    .filter(|p| !p.as_os_str().is_empty())
                    .map(|p| p.to_string_lossy().to_string())
            });
            (program_path, cd)
        } else if has_path_sep {
            match &self.current_dir {
                Some(cd) => {
                    // 相对路径 + 有 current_dir：拼接出系统能找到的绝对路径
                    let joined = Path::new(cd).join(&program_path);
                    debug!(
                        "Relative program '{}' specified with current_dir '{}', joined to '{}'",
                        program,
                        cd,
                        joined.display()
                    );
                    (joined, Some(cd.clone()))
                }
                None => {
                    warn!(
                        "Relative program '{}' specified without a working \
                         directory; the OS will search in PATH and the \
                         process CWD",
                        program
                    );
                    (program_path, None)
                }
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
pub struct ResolvedParts {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub current_dir: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
}
pub async fn launch_game_with_plugins(app: AppHandle, game_id: u32) -> Result<()> {
    let (plugins, metas, exe_path, current_dir) = {
        let lock = CONFIG.lock();
        let game = lock.get_game_by_id(game_id)?;
        let exe = match &game.excutable_path {
            Some(p) => Some(lock.resolve_var(p)?),
            None => None,
        };
        let current_dir = exe
            .as_ref()
            .and_then(|p| Path::new(p).parent())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        (
            game.plugins.clone(),
            lock.plugin_metadatas.clone(),
            exe,
            current_dir,
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

    // 2. get_launch_override hooks
    let mut launch_override = None;
    for (_, handler, ctx) in enabled_plugin_contexts(&plugins, &configs, &metas, &launch) {
        if let Some(override_ctx) = handler.get_launch_override(&ctx)? {
            launch_override = Some(override_ctx);
            break;
        }
    }

    let start_ctx = match launch_override {
        Some(ctx) => ctx,
        None => {
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
            StartCtx {
                cmd: match shlex::try_quote(&launch.exe_path) {
                    Ok(quoted) => quoted.into_owned(),
                    Err(_) => launch.exe_path.clone(),
                },
                current_dir,
                env: None,
            }
        }
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

    info!("launch_game with StartCtx: {start_ctx}");
    let res = launch_game(game_id, launch.app.clone(), game_start_tx, start_ctx).await;

    // 4. 如果游戏进程本身启动失败，立即回滚
    let res = match res {
        Ok(r) => r,
        Err(e) => {
            launch.transaction.rollback();
            return Err(e);
        }
    };

    let app_for_loop = launch.app.clone();
    let handle = tauri::async_runtime::spawn(async move {
        game_loop(res, game_id, app_for_loop, game_exit_tx).await
    });
    _ = GAME_LOOP_HANDLES.insert(game_id, handle);

    if let Err(e) = start_res.await? {
        log::error!("start_res error: {}", e);
    }
    if let Err(e) = exit_res.await? {
        log::error!("exit_res error: {}", e);
    }

    GAME_LOOP_HANDLES.remove(&game_id);
    Ok(())
}

fn update_game_time(app: &tauri::AppHandle, game_id: u32, dur: chrono::TimeDelta) -> Result<()> {
    let mut lock = CONFIG.lock();
    let game = lock.get_game_by_id_mut(game_id)?;
    game.use_time += dur;
    game.last_played_time = Some(chrono::Utc::now());
    log::info!(
        "update use_time: game_id={}, use_time updated to {}",
        game_id,
        game.use_time
    );
    lock.save_and_emit(app)
}

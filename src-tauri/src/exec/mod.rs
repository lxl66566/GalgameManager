use std::{
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::{Arc, LazyLock as Lazy},
};

use dashmap::DashMap;
use log::{debug, warn};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, async_runtime::JoinHandle};
use tokio::sync::oneshot;
use ts_rs::TS;

use crate::{
    db::CONFIG,
    error::{Error, Result},
    plugin::{PLUGIN_REGISTRY, make_plugin_context},
};

#[cfg(not(windows))]
mod unix;
#[cfg(not(windows))]
pub use unix::*;
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

impl StartCtx {
    pub fn build_command(&self) -> Result<Command> {
        let mut parts = shlex::split(&self.cmd)
            .ok_or_else(|| Error::InvalidCommand(self.cmd.clone()))?
            .into_iter();

        let program = parts
            .next()
            .ok_or_else(|| Error::InvalidCommand(self.cmd.clone()))?;

        let program_path = PathBuf::from(&program);

        let (resolved_program, resolved_current_dir) = if program_path.is_relative() {
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
            // 绝对路径：如果没有 current_dir，则从它的父目录推断
            let cd = self.current_dir.clone().or_else(|| {
                program_path
                    .parent()
                    .filter(|p| !p.as_os_str().is_empty())
                    .map(|p| p.to_string_lossy().to_string())
            });
            (program_path, cd)
        };

        // 2. 组装并配置标准库的 Command
        let mut cmd = Command::new(resolved_program);

        for arg in parts {
            cmd.arg(arg);
        }

        if let Some(cd) = resolved_current_dir {
            cmd.current_dir(cd);
        }

        if let Some(env) = &self.env {
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

pub async fn launch_game_with_plugins(app: AppHandle, game_id: u32) -> Result<()> {
    // ── Phase 1: single CONFIG lock, extract everything needed ──
    let (plugins, metas, exe_path) = {
        let lock = CONFIG.lock();
        let game = lock.get_game_by_id(game_id)?;
        let exe = match &game.excutable_path {
            Some(p) => Some(lock.resolve_var(p)?),
            None => None,
        };
        (game.plugins.clone(), lock.plugin_metadatas.clone(), exe)
    };

    let plugins = Arc::new(plugins);
    let metas = Arc::new(metas);

    // Run before_game_start hooks (only for enabled plugins)
    for instance in plugins.iter() {
        if !metas.is_enabled(instance) {
            continue;
        }
        if let Some(handler) = PLUGIN_REGISTRY.get(instance.handler_key())
            && let Some(ctx) = make_plugin_context(instance, app.clone(), game_id)
        {
            handler.before_game_start(ctx).await?;
        }
    }

    let mut launch_override = None;
    for instance in plugins.iter() {
        if !metas.is_enabled(instance) {
            continue;
        }
        if let Some(handler) = PLUGIN_REGISTRY.get(instance.handler_key())
            && let Some(ctx) = make_plugin_context(instance, app.clone(), game_id)
            && let Some(override_ctx) = handler.get_launch_override(&ctx)?
        {
            launch_override = Some(override_ctx);
            break; // only one override is allowed
        }
    }
    // Resolve the final StartCtx: plugin override takes priority,
    // otherwise fall back to the default exe-based context.
    let start_ctx = if let Some(ctx) = launch_override {
        ctx
    } else {
        // Build a default StartCtx from the game's exe_path.
        let exe_path = exe_path.ok_or(Error::Launch)?;
        let exe = Path::new(&exe_path);
        let current_dir = exe
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .map(|p| p.to_string_lossy().to_string());
        if exe.is_relative() && current_dir.is_none() {
            warn!(
                "Game executable '{}' is relative without a resolvable \
                     parent directory; the OS will search in PATH and CWD",
                exe_path
            );
        }
        StartCtx {
            cmd: exe_path,
            current_dir,
            env: None,
        }
    };

    // Share data via Arc to avoid cloning the entire plugin list & metas.
    let plugins_start = plugins.clone();
    let plugins_exit = plugins.clone();
    let metas_start = metas.clone();
    let metas_exit = metas.clone();
    let app_start = app.clone();
    let app_exit = app.clone();

    let (game_start_tx, game_start_rx) = oneshot::channel();
    let (game_exit_tx, game_exit_rx) = oneshot::channel();

    let start_res = tauri::async_runtime::spawn(async move {
        game_start_rx
            .await
            .map_err(|_| Error::InvalidChannel("game_start_rx"))?;
        // Run after_game_start hooks
        for instance in plugins_start.iter() {
            if !metas_start.is_enabled(instance) {
                continue;
            }
            if let Some(handler) = PLUGIN_REGISTRY.get(instance.handler_key())
                && let Some(ctx) = make_plugin_context(instance, app_start.clone(), game_id)
            {
                handler.after_game_start(ctx).await?;
            }
        }
        Ok::<(), Error>(())
    });

    let exit_res = tauri::async_runtime::spawn(async move {
        game_exit_rx
            .await
            .map_err(|_| Error::InvalidChannel("game_exit_rx"))?;
        // Run after_game_exit hooks
        for instance in plugins_exit.iter() {
            if !metas_exit.is_enabled(instance) {
                continue;
            }
            if let Some(handler) = PLUGIN_REGISTRY.get(instance.handler_key())
                && let Some(ctx) = make_plugin_context(instance, app_exit.clone(), game_id)
            {
                handler.after_game_exit(ctx).await?;
            }
        }
        Ok::<(), Error>(())
    });

    debug!("launch_game with ctx: {:?}", start_ctx);
    let res = launch_game(game_id, app.clone(), game_start_tx, start_ctx).await?;
    let handle =
        tauri::async_runtime::spawn(
            async move { game_loop(res, game_id, app, game_exit_tx).await },
        );
    _ = GAME_LOOP_HANDLES.insert(game_id, handle);

    start_res.await??;
    exit_res.await??;

    // Optional cleanup.
    GAME_LOOP_HANDLES.remove(&game_id);

    Ok(())
}

fn update_game_time(app: &tauri::AppHandle, game_id: u32, dur: chrono::TimeDelta) -> Result<()> {
    let mut lock = CONFIG.lock();
    let game = lock.get_game_by_id_mut(game_id).unwrap();
    game.use_time += dur;
    game.last_played_time = Some(chrono::Utc::now());
    log::info!(
        "update use_time: game_id={}, use_time updated to {}",
        game_id,
        game.use_time
    );
    lock.save_and_emit(app)
}

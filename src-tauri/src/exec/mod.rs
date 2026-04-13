use std::{
    path::Path,
    process::{Child, Command},
    sync::LazyLock as Lazy,
};

use dashmap::DashMap;
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
        let mut cmd = Command::new(
            parts
                .next()
                .ok_or_else(|| Error::InvalidCommand(self.cmd.clone()))?,
        );
        for part in parts {
            cmd.arg(part);
        }
        if let Some(current_dir) = &self.current_dir {
            cmd.current_dir(current_dir);
        } else if let Some(parent_dir) = Path::new(&self.cmd).parent() {
            cmd.current_dir(parent_dir);
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
    ///
    /// Used by the launch override path to spawn the game process
    /// asynchronously.
    pub fn build_async_command(&self) -> Result<tokio::process::Command> {
        let mut parts = shlex::split(&self.cmd)
            .ok_or_else(|| Error::InvalidCommand(self.cmd.clone()))?
            .into_iter();
        let mut cmd = tokio::process::Command::new(
            parts
                .next()
                .ok_or_else(|| Error::InvalidCommand(self.cmd.clone()))?,
        );
        for part in parts {
            cmd.arg(part);
        }
        if let Some(current_dir) = &self.current_dir {
            cmd.current_dir(current_dir);
        }
        if let Some(env) = &self.env {
            for (k, v) in env {
                cmd.env(k, v);
            }
        }
        Ok(cmd)
    }
}

pub async fn launch_game_with_plugins(app: AppHandle, game_id: u32) -> Result<()> {
    let (plugins, metas) = {
        let lock = CONFIG.lock();
        let game = lock.get_game_by_id(game_id)?;
        (game.plugins.clone(), lock.plugin_metadatas.clone())
    };

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

    // Check for launch overrides (e.g. game_wrapper, locale_emulator)
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

    let plugins_after_start = plugins.clone();
    let plugins_after_exit = plugins.clone();
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
        for instance in plugins_after_start.iter() {
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
        for instance in plugins_after_exit.iter() {
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

    let res = launch_game(game_id, app.clone(), game_start_tx, launch_override).await?;
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

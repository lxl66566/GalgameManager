use std::{
    collections::HashMap,
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
    plugin::PluginAction,
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
    pub env: Option<HashMap<String, String>>,
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
}

pub async fn launch_game_with_plugins(app: AppHandle, game_id: u32) -> Result<()> {
    let plugins = CONFIG.lock().get_game_by_id(game_id)?.plugins.clone();

    // run before_game_start plugins
    for plugin in plugins.iter() {
        plugin.before_game_start()?;
    }

    let plugins_clone = plugins.clone();
    let (game_start_tx, game_start_rx) = oneshot::channel();
    let (game_exit_tx, game_exit_rx) = oneshot::channel();
    let start_res = tauri::async_runtime::spawn(async move {
        game_start_rx
            .await
            .map_err(|_| Error::InvalidChannel("game_start_rx"))?;
        // run after_game_start plugins
        for plugin in plugins.iter() {
            plugin.after_game_start()?;
        }
        Ok::<(), Error>(())
    });
    let exit_res = tauri::async_runtime::spawn(async move {
        game_exit_rx
            .await
            .map_err(|_| Error::InvalidChannel("game_exit_rx"))?;
        // run after_game_exit plugins
        for plugin in plugins_clone.iter() {
            plugin.after_game_exit()?;
        }
        Ok::<(), Error>(())
    });

    let res = launch_game(game_id, app.clone(), game_start_tx).await?;
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

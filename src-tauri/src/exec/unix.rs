use std::{path::Path, time::Duration};

use log::{error, info};
use tauri::{AppHandle, Emitter as _};
use tokio::{process::Command, sync::oneshot, time};

use crate::error::{Error, Result};

pub type GameLaunchRes = tokio::process::Child;

pub async fn launch_game(
    game_id: u32,
    app: AppHandle,
    game_start_sender: oneshot::Sender<()>,
    launch_override: Option<super::StartCtx>,
    exe_path: Option<String>,
) -> Result<GameLaunchRes> {
    let child = if let Some(ctx) = launch_override {
        let mut cmd = ctx.build_async_command()?;
        cmd.spawn()?
    } else {
        // Use pre-resolved exe_path (avoid a second CONFIG lock)
        let exe_path = exe_path.ok_or(Error::Launch)?;

        let mut cmd = Command::new(&exe_path);
        if let Some(parent) = Path::new(&exe_path).parent() {
            cmd.current_dir(parent);
        }
        cmd.spawn()?
    };

    app.emit(&format!("game://spawn/{}", game_id), ())?;
    game_start_sender
        .send(())
        .map_err(|_| Error::InvalidChannel("game_start_sender"))?;

    Ok(child)
}

pub async fn game_loop(
    mut child: GameLaunchRes,
    game_id: u32,
    app: AppHandle,
    game_exit_sender: oneshot::Sender<()>,
) -> Result<()> {
    let mut interval = time::interval(Duration::from_secs(60));
    let mut last_time_saved = chrono::Utc::now();
    // The first tick fires immediately, so skip it.
    interval.tick().await;

    loop {
        tokio::select! {
            // Branch A: process exited
            status = child.wait() => {
                app.emit(&format!("game://exit/{}", game_id), status.is_ok())?;
                match status {
                    Ok(s) => info!("Game exited with status: {}", s),
                    Err(e) => error!("Error waiting for game process: {}", e),
                }
                super::update_game_time(&app, game_id, chrono::Utc::now() - last_time_saved)?;
                game_exit_sender
                    .send(())
                    .map_err(|_| Error::InvalidChannel("game_exit_sender"))?;
                break Ok(());
            }
            // Branch B: timer tick (every 60s)
            _ = interval.tick() => {
                super::update_game_time(&app, game_id, chrono::Utc::now() - last_time_saved)?;
                last_time_saved = chrono::Utc::now();
            }
        }
    }
}

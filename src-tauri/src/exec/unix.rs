use std::{path::Path, time::Duration};

use chrono::TimeDelta;
use tauri::{AppHandle, Emitter as _};
use tokio::{process::Command, time};

use crate::{
    db::CONFIG,
    error::{Error, Result},
};

pub async fn launch_game(app: AppHandle, game_id: u32, save_interval: u32) -> Result<()> {
    let exe_path: String = {
        let lock = CONFIG.lock();
        lock.resolve_var(
            &lock
                .get_game_by_id(game_id)?
                .excutable_path
                .clone()
                .ok_or(Error::Launch)?,
        )?
    };

    let mut cmd = Command::new(&exe_path);
    if let Some(parent) = Path::new(&exe_path).parent() {
        cmd.current_dir(parent);
    }
    let mut child = cmd.spawn()?;
    app.emit(&format!("game://spawn/{}", game_id), ())?;

    let mut interval = time::interval(Duration::from_secs(60));
    // 第一个 tick 是立即执行的，跳过
    interval.tick().await;

    loop {
        tokio::select! {
            // 分支 A: 进程退出
            status = child.wait() => {
                app.emit(&format!("game://exit/{}", game_id), status.is_ok())?;
                match status {
                    Ok(s) => println!("Game exited with status: {}", s),
                    Err(e) => eprintln!("Error waiting for game process: {}", e),
                }
                break Ok(()); // 退出循环
            }
            // 分支 B: 定时器触发 (每分钟)
            _ = interval.tick() => {
                super::update_game_time(&app, game_id, TimeDelta::seconds(save_interval as i64))?;
            }
        }
    }
}

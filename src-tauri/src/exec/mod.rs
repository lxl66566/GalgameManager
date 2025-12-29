use crate::db::CONFIG;
use crate::error::{Error, Result};
use chrono::{TimeDelta, Utc};
use std::time::Duration;
use tauri::{AppHandle, Emitter as _};
use tokio::process::Command;
use tokio::time;

pub async fn launch_game(app: AppHandle, game_id: u32) -> Result<()> {
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

    let mut child = Command::new(&exe_path).spawn()?;
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
                // 加锁更新状态
                let new_config = {
                    let mut config = CONFIG.lock().clone();
                    match config.get_game_by_id_mut(game_id){
                        Ok(game) => {
                            game.use_time += TimeDelta::minutes(1);
                            game.last_played_time = Some(Utc::now())
                        },
                        Err(e) => {
                            break Err(e);
                        }
                    };
                    config
                };
                {
                    let mut lock = CONFIG.lock();
                    *lock = new_config;
                    let res = lock.save_and_emit(&app);
                    if let Err(e) = res {
                        break Err(e);
                    }
                }
            }
        }
    }
}

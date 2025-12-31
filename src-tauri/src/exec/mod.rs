#[cfg(not(windows))]
mod unix;
#[cfg(not(windows))]
pub use unix::*;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;

use crate::{db::CONFIG, error::Result};

fn update_game_time(app: &tauri::AppHandle, game_id: u32, dur: chrono::TimeDelta) -> Result<()> {
    let new_config = {
        let mut config = CONFIG.lock().clone();
        let game = config.get_game_by_id_mut(game_id).unwrap();

        game.use_time += dur;
        game.last_played_time = Some(chrono::Utc::now());
        config
    };

    let mut lock = CONFIG.lock();
    *lock = new_config;
    lock.save_and_emit(app)
}

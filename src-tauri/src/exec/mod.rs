#[cfg(not(windows))]
mod unix;
#[cfg(not(windows))]
pub use unix::*;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;

use chrono::{TimeDelta, Utc};
use tauri::AppHandle;

use crate::{db::CONFIG, error::Result};

fn update_game_time(app: &AppHandle, game_id: u32, dur: TimeDelta) -> Result<()> {
    let new_config = {
        let mut config = CONFIG.lock().clone();
        let game = config.get_game_by_id_mut(game_id).unwrap();

        game.use_time += dur;
        game.last_played_time = Some(Utc::now());
        config
    };

    let mut lock = CONFIG.lock();
    *lock = new_config;
    lock.save_and_emit(app)
}

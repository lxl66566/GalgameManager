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

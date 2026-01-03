#[cfg(not(windows))]
mod unix;
use std::collections::HashMap;

#[cfg(not(windows))]
pub use unix::*;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;

use crate::{db::CONFIG, error::Result};

#[derive(Debug, Clone)]
pub struct StartCtx {
    pub cmd: String,
    pub current_dir: String,
    pub env: HashMap<String, String>,
}

fn update_game_time(app: &tauri::AppHandle, game_id: u32, dur: chrono::TimeDelta) -> Result<()> {
    let mut lock = CONFIG.lock();
    let game = lock.get_game_by_id_mut(game_id).unwrap();
    game.use_time += dur;
    game.last_played_time = Some(chrono::Utc::now());
    lock.save_and_emit(app)
}

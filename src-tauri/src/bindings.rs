use crate::db::{Config, CONFIG};
use crate::error::Error;
use crate::error::Result;
use config_file2::Storable;
use tauri::{AppHandle, Emitter};

pub const EVENT_CONFIG_UPDATED: &str = "config://updated";

#[tauri::command]
pub fn get_config() -> Result<Config> {
    let lock = CONFIG.lock();
    Ok(lock.clone())
}

#[tauri::command]
pub fn save_config(app: AppHandle, new_config: Config) -> Result<()> {
    let mut lock = CONFIG.lock();
    *lock = new_config;
    lock.store()?;
    app.emit(EVENT_CONFIG_UPDATED, &*lock)
        .map_err(|_| Error::Emit)?;
    Ok(())
}


use config_file2::Storable;
use strfmt::strfmt;
use tauri::{AppHandle, Emitter, Manager as _};

use crate::{
    archive::{archive_impl, Archive as _},
    db::{
        device::{DEFAULT_DEVICE, DEVICE_UID},
        Config, CONFIG,
    },
    error::{Error, Result},
};

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

#[tauri::command]
pub fn device_id() -> &'static str {
    *DEVICE_UID
}

#[tauri::command]
pub fn resolve_var(s: &str) -> Result<String> {
    let lock = CONFIG.lock();
    let device = lock.get_device().unwrap_or(&*DEFAULT_DEVICE);
    Ok(strfmt(s, &device.variables)?)
}

#[tauri::command]
pub fn archive(app: AppHandle, game_id: u32, paths: Vec<String>) -> Result<String> {
    let data_dir = app.path().app_local_data_dir()?;

    let lock = CONFIG.lock();
    let archive_conf = lock.settings.archive.clone();
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());
    drop(lock);

    archive_impl(&archive_conf, game_backup_dir, paths)
}

use config_file2::Storable;
use strfmt::strfmt;
use tauri::{AppHandle, Manager as _};

use crate::{
    archive::{archive_impl, restore_impl},
    db::{
        device::{DEFAULT_DEVICE, DEVICE_UID},
        Config, CONFIG,
    },
    error::Result,
    http::ImageData,
};

#[tauri::command]
pub fn get_config() -> Result<Config> {
    let lock = CONFIG.lock();
    Ok(lock.clone())
}

#[tauri::command]
pub fn save_config(new_config: Config) -> Result<()> {
    let mut lock = CONFIG.lock();
    *lock = new_config;
    lock.store()?;
    // app.emit("config://updated", &*lock)?;
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

#[tauri::command(async)]
pub async fn get_image(url: String, hash: Option<String>) -> Result<ImageData> {
    crate::http::get_image(&url, hash.as_deref()).await
}

#[tauri::command]
pub fn archive(app: AppHandle, game_id: u32) -> Result<String> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());

    let lock = CONFIG.lock();
    let archive_conf = lock.settings.archive.clone();
    let paths = lock.get_game_by_id(game_id)?.save_paths.clone();
    drop(lock);

    archive_impl(&archive_conf, game_backup_dir, paths)
}

#[tauri::command]
pub fn extract(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());

    let lock = CONFIG.lock();
    let archive_conf = lock.settings.archive.clone();
    let paths = lock.get_game_by_id(game_id)?.save_paths.clone();
    drop(lock);

    restore_impl(&archive_conf, game_backup_dir, archive_filename, paths)
}

use std::fs;

use config_file2::Storable;
use tauri::{AppHandle, Manager as _};

use crate::{
    archive::{archive_impl, restore_impl},
    db::{device::DEVICE_UID, settings::StorageConfig, Config, CONFIG},
    error::Result,
    exec::launch_game,
    http::ImageData,
    sync::{init_operator, CURRENT_OPERATOR},
    utils::list_dir_all,
};

#[tauri::command]
pub fn get_config() -> Result<Config> {
    let lock = CONFIG.lock();
    Ok(lock.clone())
}

// called from frontend, do not use it in other places
#[tauri::command]
pub fn save_config(new_config: Config) -> Result<()> {
    let mut lock = CONFIG.lock();
    *lock = new_config;
    lock.store()?;
    Ok(())
}

#[tauri::command]
pub fn device_id() -> &'static str {
    *DEVICE_UID
}

#[tauri::command]
pub fn resolve_var(s: &str) -> Result<String> {
    CONFIG.lock().resolve_var(s)
}

// region http

#[tauri::command(async)]
pub async fn get_image(url: String, hash: Option<String>) -> Result<ImageData> {
    crate::http::get_image(&url, hash.as_deref()).await
}

// region archive

#[tauri::command]
pub fn list_local_archive(app: AppHandle, game_id: u32) -> Result<Vec<String>> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());
    Ok(list_dir_all(game_backup_dir)?)
}

#[tauri::command]
pub fn delete_local_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());
    let archive_path = game_backup_dir.join(archive_filename);
    fs::remove_file(archive_path)?;
    Ok(())
}

#[tauri::command]
pub fn rename_local_archive(
    app: AppHandle,
    game_id: u32,
    archive_filename: String,
    new_archive_filename: String,
) -> Result<()> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());
    let archive_path = game_backup_dir.join(archive_filename);
    let new_archive_path = game_backup_dir.join(new_archive_filename);
    fs::rename(archive_path, new_archive_path)?;
    Ok(())
}

#[tauri::command]
pub fn archive(app: AppHandle, game_id: u32) -> Result<String> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());

    let lock = CONFIG.lock();
    let archive_conf = lock.settings.archive.clone();
    let paths = lock.get_game_by_id(game_id)?.save_paths.clone();
    let device_name = lock
        .get_device()
        .map(|d| d.name.clone())
        .unwrap_or(format!("Unknown{}", lock.devices.len()));
    drop(lock);

    archive_impl(&device_name, &archive_conf, game_backup_dir, paths)
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

// region sync

#[tauri::command(async)]
pub async fn list_archive(game_id: u32) -> Result<Vec<String>> {
    init_operator().await?;
    let lock = CURRENT_OPERATOR.lock().await;
    let op = lock.as_ref().unwrap();
    op.list_archive(game_id).await
}

#[tauri::command(async)]
pub async fn upload_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    init_operator().await?;
    let lock = CURRENT_OPERATOR.lock().await;
    let op = lock.as_ref().unwrap();
    println!(
        "upload archive: game_id={}, archive_filename={}",
        game_id, archive_filename
    );
    op.upload_archive(
        game_id,
        &archive_filename,
        &app.path().app_local_data_dir()?.join("backup"),
    )
    .await
}

#[tauri::command(async)]
pub async fn delete_archive(game_id: u32, archive_filename: String) -> Result<()> {
    init_operator().await?;
    let lock = CURRENT_OPERATOR.lock().await;
    let op = lock.as_ref().unwrap();
    op.delete_archive(game_id, &archive_filename).await
}

#[tauri::command(async)]
pub async fn pull_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    init_operator().await?;
    let lock = CURRENT_OPERATOR.lock().await;
    let op = lock.as_ref().unwrap();
    op.pull_archive(
        game_id,
        &archive_filename,
        &app.path().app_local_data_dir()?.join("backup"),
    )
    .await
}

#[tauri::command(async)]
pub async fn rename_remote_archive(
    game_id: u32,
    archive_filename: String,
    new_archive_filename: String,
) -> Result<()> {
    init_operator().await?;
    let lock = CURRENT_OPERATOR.lock().await;
    let op = lock.as_ref().unwrap();
    op.rename_archive(game_id, &archive_filename, &new_archive_filename)
        .await
}

#[tauri::command(async)]
pub async fn clean_current_operator() -> Result<()> {
    let mut lock = CURRENT_OPERATOR.lock().await;
    *lock = None;
    Ok(())
}

#[tauri::command(async)]
pub async fn upload_config() -> Result<()> {
    init_operator().await?;
    let lock = CURRENT_OPERATOR.lock().await;
    let op = lock.as_ref().unwrap();
    op.upload_config().await?;
    Ok(())
}

#[tauri::command(async)]
pub async fn upload_config_safe() -> Result<bool> {
    init_operator().await?;
    let lock = CURRENT_OPERATOR.lock().await;
    let op = lock.as_ref().unwrap();
    op.upload_config_safe().await
}

#[tauri::command(async)]
pub async fn get_remote_config() -> Result<Option<Config>> {
    // prevent downloading config if storage is not configured
    if CONFIG.lock().settings.storage == StorageConfig::default() {
        return Ok(None);
    }
    init_operator().await?;
    let lock = CURRENT_OPERATOR.lock().await;
    let op = lock.as_ref().unwrap();
    op.get_remote_config().await
}

// region exec

#[tauri::command(async)]
pub async fn exec(app: AppHandle, game_id: u32) {
    _ = tauri::async_runtime::spawn(async move { launch_game(app, game_id, 30).await });
}

use std::{collections::HashMap, fs, path::PathBuf, sync::LazyLock as Lazy};

use config_file2::Storable;
use parking_lot::Mutex;
use tauri::{async_runtime::JoinHandle, AppHandle, Manager as _};

use crate::{
    archive::{archive_impl, restore_impl},
    db::{device::DEVICE_UID, settings::SortType, Config, CONFIG, CONFIG_DIR},
    error::Result,
    exec::launch_game,
    http::ImageData,
    sync::MyOperation,
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

static SORT_TYPE_PATH: Lazy<PathBuf> = Lazy::new(|| CONFIG_DIR.join("sort_type"));

#[tauri::command]
pub fn set_sort_type(sort_type: SortType) -> Result<()> {
    fs::write(SORT_TYPE_PATH.as_path(), sort_type.as_str())?;
    Ok(())
}

#[tauri::command]
pub fn get_sort_type() -> Result<SortType> {
    let sort_type = SortType::from_str(&fs::read_to_string(SORT_TYPE_PATH.as_path())?);
    Ok(sort_type.unwrap_or_default())
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
pub fn delete_local_archive_all(app: AppHandle, game_id: u32) -> Result<()> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());
    fs::remove_dir_all(game_backup_dir)?;
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

#[inline]
fn build_operator_with_varmap() -> Result<Box<dyn MyOperation + Send + Sync>> {
    let lock = CONFIG.lock();
    let varmap = lock.varmap()?;
    lock.settings.storage.build_operator(varmap)
}

#[tauri::command(async)]
pub async fn list_archive(game_id: u32) -> Result<Vec<String>> {
    build_operator_with_varmap()?.list_archive(game_id).await
}

#[tauri::command(async)]
pub async fn upload_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    println!(
        "uploading archive: game_id={}, archive_filename={}",
        game_id, archive_filename
    );
    build_operator_with_varmap()?
        .upload_archive(
            game_id,
            &archive_filename,
            &app.path().app_local_data_dir()?.join("backup"),
        )
        .await
}

#[tauri::command(async)]
pub async fn delete_archive(game_id: u32, archive_filename: String) -> Result<()> {
    build_operator_with_varmap()?
        .delete_archive(game_id, &archive_filename)
        .await
}

#[tauri::command(async)]
pub async fn delete_archive_all(game_id: u32) -> Result<()> {
    build_operator_with_varmap()?
        .delete_archive_all(game_id)
        .await
}

#[tauri::command(async)]
pub async fn pull_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    build_operator_with_varmap()?
        .pull_archive(
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
    build_operator_with_varmap()?
        .rename_archive(game_id, &archive_filename, &new_archive_filename)
        .await
}

/// Operator needs to be cleaned every time the config of storage backend is
/// changed
#[tauri::command]
pub fn clean_current_operator() {
    CONFIG.lock().settings.storage.clean_current_operator()
}

#[tauri::command(async)]
pub async fn upload_config() -> Result<()> {
    let op = build_operator_with_varmap()?;
    op.upload_config("config.toml").await?;
    #[cfg(feature = "config-daily-backup")]
    {
        _ = tauri::async_runtime::spawn(async move {
            let time = chrono::Local::now().format("%Y%m%d");
            let filename = format!("config_{}.toml", time);
            _ = op.upload_config(&filename).await;
        });
    }
    Ok(())
}

#[tauri::command(async)]
pub async fn upload_config_safe() -> Result<bool> {
    let op = build_operator_with_varmap()?;
    let res = op.upload_config_safe("config.toml").await?;
    #[cfg(feature = "config-daily-backup")]
    {
        _ = tauri::async_runtime::spawn(async move {
            let time = chrono::Local::now().format("%Y%m%d");
            let filename = format!("config_{}.toml", time);
            _ = op.upload_config_safe(&filename).await;
        });
    }
    Ok(res)
}

#[tauri::command(async)]
pub async fn get_remote_config() -> Result<Option<Config>> {
    // prevent downloading config if storage is not configured
    if CONFIG.lock().settings.storage.is_not_set() {
        return Ok(None);
    }
    build_operator_with_varmap()?.get_remote_config().await
}

// region exec

static GAME_HANDLES: Lazy<Mutex<HashMap<u32, JoinHandle<Result<()>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command(async)]
pub async fn exec(app: AppHandle, game_id: u32) {
    let handle = tauri::async_runtime::spawn(async move { launch_game(app, game_id).await });
    _ = GAME_HANDLES.lock().insert(game_id, handle);
}

// currently not used
#[tauri::command]
pub fn is_game_running(game_id: u32) -> bool {
    let handles = GAME_HANDLES.lock();
    if let Some(handle) = handles.get(&game_id) {
        !handle.inner().is_finished()
    } else {
        false
    }
}

#[tauri::command]
pub fn running_game_ids() -> Vec<u32> {
    let handles = GAME_HANDLES.lock();
    handles
        .iter()
        .filter_map(|(id, handle)| (!handle.inner().is_finished()).then_some(*id))
        .collect()
}

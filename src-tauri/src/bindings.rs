use std::{fs, path::PathBuf, sync::LazyLock as Lazy};

use chrono::Utc;
use config_file2::Storable;
use log::info;
use tauri::{AppHandle, Manager as _};

use crate::{
    archive::{ArchiveInfo, archive_impl, restore_impl},
    db::{CONFIG, CONFIG_DIR, Config, device::DEVICE_UID, settings::SortType},
    error::{Error, Result},
    exec::{GAME_LOOP_HANDLES, launch_game_with_plugins},
    logging::LogLevel,
    plugin::{dispatch_after_save_upload, dispatch_before_save_upload},
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
    lock.last_updated = Utc::now();
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

#[tauri::command]
pub fn log(level: LogLevel, msg: String) {
    log::log!(level.into(), "{}", msg);
}

// region http

#[tauri::command(async)]
pub async fn prepare_image(url: String, hash: Option<String>) -> Result<String> {
    crate::http::prepare_image(&url, hash.as_deref()).await
}

// region archive

#[tauri::command]
pub fn list_local_archive(app: AppHandle, game_id: u32) -> Result<Vec<ArchiveInfo>> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());
    if !game_backup_dir.exists() {
        return Ok(vec![]);
    }
    Ok(list_dir_all(game_backup_dir)?)
}

#[tauri::command]
pub fn delete_local_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());
    let archive_path = game_backup_dir.join(archive_filename);
    fs::remove_file(&archive_path)?;
    info!("delete local archive: {}", archive_path.display());
    Ok(())
}

#[tauri::command]
pub fn delete_local_archive_all(app: AppHandle, game_id: u32) -> Result<()> {
    let data_dir = app.path().app_local_data_dir()?;
    let game_backup_dir = data_dir.join("backup").join(game_id.to_string());
    fs::remove_dir_all(&game_backup_dir)?;
    info!("delete all local archive: {}", game_backup_dir.display());
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
    fs::rename(&archive_path, &new_archive_path)?;
    info!(
        "rename local archive: {} -> {}",
        archive_path.display(),
        new_archive_path.display()
    );
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

    // logged inner
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

    // logged inner
    restore_impl(&archive_conf, game_backup_dir, archive_filename, paths)
}

// region sync

#[inline]
fn build_operator_with_varmap(app: &AppHandle) -> Result<Box<dyn MyOperation + Send + Sync>> {
    use std::time::Duration;

    let lock = CONFIG.lock();
    let varmap = lock.varmap();
    let io_timeout = Duration::from_secs(lock.settings.sync_io_timeout_secs.max(1) as u64);
    let non_io_timeout = Duration::from_secs(lock.settings.sync_non_io_timeout_secs.max(1) as u64);
    lock.settings
        .storage
        .build_operator_with_timeouts(app, varmap, io_timeout, non_io_timeout)
}

#[tauri::command(async)]
pub async fn list_archive(app: AppHandle, game_id: u32) -> Result<Vec<ArchiveInfo>> {
    build_operator_with_varmap(&app)?
        .list_archive(game_id)
        .await
}

#[tauri::command(async)]
pub async fn upload_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    info!(
        "uploading archive: game_id={}, archive_filename={}",
        game_id, archive_filename
    );

    // Dispatch before_save_upload hooks
    dispatch_before_save_upload(&app, game_id, &archive_filename).await?;

    build_operator_with_varmap(&app)?
        .upload_archive(
            game_id,
            &archive_filename,
            &app.path().app_local_data_dir()?.join("backup"),
        )
        .await?;

    // Dispatch after_save_upload hooks (non-fatal)
    dispatch_after_save_upload(&app, game_id, &archive_filename).await;

    Ok(())
}

#[tauri::command(async)]
pub async fn delete_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    build_operator_with_varmap(&app)?
        .delete_archive(game_id, &archive_filename)
        .await
}

#[tauri::command(async)]
pub async fn delete_archive_all(app: AppHandle, game_id: u32) -> Result<()> {
    build_operator_with_varmap(&app)?
        .delete_archive_all(game_id)
        .await
}

#[tauri::command(async)]
pub async fn pull_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    build_operator_with_varmap(&app)?
        .pull_archive(
            game_id,
            &archive_filename,
            &app.path().app_local_data_dir()?.join("backup"),
        )
        .await
}

#[tauri::command(async)]
pub async fn rename_remote_archive(
    app: AppHandle,
    game_id: u32,
    archive_filename: String,
    new_archive_filename: String,
) -> Result<()> {
    build_operator_with_varmap(&app)?
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
pub async fn upload_config(app: AppHandle, safe: bool) -> Result<bool> {
    info!("upload_config triggered, safe: {}", safe);
    let op = build_operator_with_varmap(&app)?;
    let res = op.upload_config(&app, safe).await?;
    #[cfg(feature = "config-daily-backup")]
    if res && let Err(e) = op.replicate_config().await {
        log::error!("Failed to replicate config: {e}");
    }
    Ok(res)
}

// currently not used. please use apply_remote_config instead.
#[tauri::command(async)]
pub async fn get_remote_config(app: AppHandle) -> Result<Option<Config>> {
    // prevent downloading config if storage is not configured
    if CONFIG.lock().settings.storage.is_not_set() {
        return Ok(None);
    }
    build_operator_with_varmap(&app)?.get_remote_config().await
}

#[tauri::command(async)]
pub async fn apply_remote_config(app: AppHandle, safe: bool) -> Result<(Option<Config>, bool)> {
    build_operator_with_varmap(&app)?
        .apply_remote_config(&app, safe)
        .await
}

// region exec

#[tauri::command(async)]
pub async fn exec(app: AppHandle, game_id: u32) -> Result<()> {
    launch_game_with_plugins(app, game_id).await
}

// currently not used
#[tauri::command]
pub fn is_game_running(game_id: u32) -> bool {
    if let Some(handle) = GAME_LOOP_HANDLES.get(&game_id) {
        !handle.inner().is_finished()
    } else {
        false
    }
}

#[tauri::command]
pub fn running_game_ids() -> Vec<u32> {
    GAME_LOOP_HANDLES
        .iter()
        .filter_map(|r| (!r.inner().is_finished()).then_some(*r.key()))
        .collect()
}

/// Check whether each path in `paths` exists on the local filesystem.
///
/// Resolves variables first, then checks existence. Returns a `Vec<bool>`
/// with the same length and order as the input.
#[tauri::command]
pub fn paths_exist(paths: Vec<String>) -> Result<Vec<bool>> {
    let lock = CONFIG.lock();
    let results = paths
        .iter()
        .map(|p| {
            lock.resolve_var(p)
                .map(|resolved| std::path::Path::new(&resolved).exists())
                .unwrap_or(false)
        })
        .collect();
    Ok(results)
}

/// Open the directory containing the game executable in the system file
/// manager.
#[tauri::command]
pub fn open_game_dir(game_id: u32) -> Result<()> {
    let lock = CONFIG.lock();
    let game = lock.get_game_by_id(game_id)?;
    let exe_path = game.excutable_path.as_deref().ok_or(Error::Launch)?;
    let resolved = lock.resolve_var(exe_path)?;
    drop(lock);

    let dir = std::path::Path::new(&resolved)
        .parent()
        .ok_or_else(|| Error::InvalidCommand("no parent dir".into()))?;
    opener::open(dir).map_err(Error::Open)?;
    Ok(())
}

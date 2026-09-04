// Tauri commands must accept owned arguments (serde deserializes from the IPC
// payload) and uniformly return Result<T> (for IPC error propagation), even
// when a particular command never fails. These are framework constraints, not
// design issues — suppress the pedantic lints module-wide.
#![allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]

use std::{fs, path::PathBuf};

use chrono::Utc;
use log::info;
use struct_patch::Patch as _;
use tauri::{AppHandle, Manager as _};

use crate::{
    archive::{ArchiveInfo, archive_impl, restore_impl},
    db::{CONFIG, Config, ConfigPatch, device::DEVICE_UID, saver::ConfigSaver},
    error::{Error, Result},
    exec::{GAME_LOOP_HANDLES, launch_game_with_plugins},
    logging::LogLevel,
    plugin::{SaveUploadDispatcher, Transaction},
    sync::{MyOperation, UploadConfigStatus},
    utils::list_dir_all,
};

#[tauri::command]
pub fn get_config() -> Result<Config> {
    let lock = CONFIG.lock();
    Ok(lock.clone())
}

/// Whether this launch started from a corrupted-config fallback (the broken
/// file was backed up as `config.toml.bak`, see `db::CONFIG`). The frontend
/// polls this once its listeners are up and warns the user — polling instead
/// of an emitted event so the notice can't be lost to the webview-load race.
#[tauri::command]
pub fn config_was_corrupted() -> bool {
    crate::db::CONFIG_CORRUPTED.load(std::sync::atomic::Ordering::Relaxed)
}

// called from frontend, do not use it in other places
#[tauri::command]
pub fn save_config(new_config: Config) -> Result<()> {
    let mut lock = CONFIG.lock();
    *lock = new_config;
    lock.last_updated = Utc::now();
    // Throttled: emit is skipped here because the frontend already holds
    // the freshest state and would otherwise just reconcile back to the
    // same value. The disk write is delegated to the background writer.
    ConfigSaver::request("frontend::save_config");
    Ok(())
}

/// Apply a partial patch to the global config. Used for the common
/// "user edited one field" save path.
///
/// Unlike [`save_config`], this only touches fields the patch explicitly
/// sets, leaving everything else (notably `use_time`, `daily_playtime` and
/// `last_played_time` just written by the game loop) untouched. This is
/// what fixes the long-standing race where a stale frontend snapshot
/// reverted the Rust side's recent writes.
///
/// `last_updated` is bumped here, same as `save_config`. The disk write is
/// throttled; emit is skipped for the same reason as `save_config`.
// called from frontend, do not use it in other places
#[tauri::command]
pub fn patch_config(patch: ConfigPatch) -> Result<()> {
    let mut lock = CONFIG.lock();
    lock.apply(patch);
    lock.last_updated = Utc::now();
    ConfigSaver::request("frontend::patch_config");
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

#[tauri::command]
pub fn log(level: LogLevel, msg: String) {
    log::log!(level.into(), "{msg}");
}

// region http

#[tauri::command(async)]
pub async fn prepare_image(
    url: String,
    sha256: Option<String>,
    need_color: bool,
) -> Result<(String, Option<String>)> {
    crate::color::prepare_image(&url, sha256.as_deref(), need_color).await
}

/// Re-extract cover colors for all games in the background. See
/// [`crate::color::refresh_all_cover_colors`].
#[tauri::command(async)]
pub async fn refresh_all_cover_colors(app: AppHandle) -> Result<()> {
    crate::color::refresh_all_cover_colors(&app).await
}

/// Drop every cached `cover_color`. See
/// [`crate::color::clear_all_cover_colors`].
#[tauri::command]
pub fn clear_all_cover_colors(app: AppHandle) -> Result<()> {
    crate::color::clear_all_cover_colors(&app)
}

// region archive

/// Resolve the local backup directory for a game's archives:
/// `<app_local_data>/backup/<game_id>`.
#[inline]
fn game_backup_dir(app: &AppHandle, game_id: u32) -> Result<PathBuf> {
    Ok(app
        .path()
        .app_local_data_dir()?
        .join("backup")
        .join(game_id.to_string()))
}

#[tauri::command]
pub fn list_local_archive(app: AppHandle, game_id: u32) -> Result<Vec<ArchiveInfo>> {
    let game_backup_dir = game_backup_dir(&app, game_id)?;
    if !game_backup_dir.exists() {
        return Ok(vec![]);
    }
    Ok(list_dir_all(game_backup_dir)?)
}

#[tauri::command]
pub fn delete_local_archive(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    let game_backup_dir = game_backup_dir(&app, game_id)?;
    let archive_path = game_backup_dir.join(archive_filename);
    fs::remove_file(&archive_path)?;
    info!("delete local archive: {}", archive_path.display());
    Ok(())
}

#[tauri::command]
pub fn delete_local_archive_all(app: AppHandle, game_id: u32) -> Result<()> {
    let game_backup_dir = game_backup_dir(&app, game_id)?;
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
    let game_backup_dir = game_backup_dir(&app, game_id)?;
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

// Plain sync commands would run on the main thread and freeze the whole
// window (webview included) for the duration of a multi-hundred-MB zstd
// job — hence async + spawn_blocking, which also keeps the CPU-bound work
// off the async runtime workers.
#[tauri::command(async)]
pub async fn archive(app: AppHandle, game_id: u32) -> Result<String> {
    let game_backup_dir = game_backup_dir(&app, game_id)?;

    let (archive_conf, paths, device_name) = {
        let lock = CONFIG.lock();
        let archive_conf = lock.settings.archive.clone();
        let paths = lock.get_game_by_id(game_id)?.save_paths.clone();
        let device_name = lock
            .get_device()
            .map(|d| d.name.clone())
            .unwrap_or(format!("Unknown{}", lock.devices.len()));
        (archive_conf, paths, device_name)
    };

    // logged inner
    tauri::async_runtime::spawn_blocking(move || {
        archive_impl(&device_name, &archive_conf, &game_backup_dir, &paths)
    })
    .await
    .map_err(|e| Error::JoinError(e.to_string()))?
}

#[tauri::command(async)]
pub async fn extract(app: AppHandle, game_id: u32, archive_filename: String) -> Result<()> {
    let game_backup_dir = game_backup_dir(&app, game_id)?;

    let (archive_conf, paths) = {
        let lock = CONFIG.lock();
        let archive_conf = lock.settings.archive.clone();
        let paths = lock.get_game_by_id(game_id)?.save_paths.clone();
        (archive_conf, paths)
    };

    // logged inner
    tauri::async_runtime::spawn_blocking(move || {
        restore_impl(&archive_conf, &game_backup_dir, &archive_filename, &paths)
    })
    .await
    .map_err(|e| Error::JoinError(e.to_string()))?
}

// region sync

#[inline]
fn build_operator_with_varmap(app: &AppHandle) -> Result<Box<dyn MyOperation + Send + Sync>> {
    use std::time::Duration;

    let lock = CONFIG.lock();
    let varmap = lock.varmap();
    let io_timeout = Duration::from_secs(u64::from(lock.settings.sync_io_timeout_secs.max(1)));
    let non_io_timeout =
        Duration::from_secs(u64::from(lock.settings.sync_non_io_timeout_secs.max(1)));
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
    info!("uploading archive: game_id={game_id}, archive_filename={archive_filename}");

    let tx = Transaction::new();
    let save_dispatcher = SaveUploadDispatcher::new(&app, game_id, tx.clone())?;

    if let Err(e) = save_dispatcher.dispatch_before(&archive_filename).await {
        tx.rollback();
        return Err(e);
    }

    if let Err(e) = build_operator_with_varmap(&app)?
        .upload_archive(
            game_id,
            &archive_filename,
            &app.path().app_local_data_dir()?.join("backup"),
        )
        .await
    {
        tx.rollback();
        return Err(e);
    }

    save_dispatcher.dispatch_after(&archive_filename).await;

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
    CONFIG.lock().settings.storage.clean_current_operator();
}

#[tauri::command(async)]
pub async fn upload_config(app: AppHandle, safe: bool) -> Result<UploadConfigStatus> {
    info!("upload_config triggered, safe: {safe}");
    let op = build_operator_with_varmap(&app)?;
    let res = op.upload_config(&app, safe).await?;
    #[cfg(feature = "config-daily-backup")]
    if matches!(res, UploadConfigStatus::Uploaded)
        && let Err(e) = op.replicate_config().await
    {
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
                .is_ok_and(|resolved| std::path::Path::new(&resolved).exists())
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

// region daily playtime

// NOTE: there is intentionally no `get_daily_playtime` command. The stats page
// reads `daily_playtime` from the reactive config store (`config://updated`),
// which is emitted by `update_game_time` on every save — keeping one source of
// truth and giving the charts live updates for free.

#[tauri::command]
pub fn clear_all_daily_playtime(app: AppHandle) -> Result<()> {
    let mut lock = CONFIG.lock();
    for game in &mut lock.games {
        game.daily_playtime.clear();
    }
    lock.save_and_emit(&app)
}

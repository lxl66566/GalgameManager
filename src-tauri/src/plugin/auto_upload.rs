//! Auto-upload plugin: automatically archive and upload saves when a game
//! exits.
//!
//! This module is self-contained — it defines all config types **and** the
//! handler in one place.

use serde::{Deserialize, Serialize};
use tauri::Manager as _;
use ts_rs::TS;

use super::{PluginContext, Transaction, dispatch_after_save_upload, dispatch_before_save_upload};
use crate::{
    error::Result,
    utils::toast::{ToastVariant, dismiss_toast, emit_loading_toast, emit_toast},
};

/// Plugin identifier used in the registry and config.
pub const PLUGIN_ID: &str = "autoUpload";

/// i18n hint keys used in toast messages.
const HINT_ARCHIVE_FAILED: &str = "<hint.archiveFailed>";
const HINT_UPLOAD_FAILED: &str = "<hint.uploadFailed>";
const HINT_UPLOAD_SUCCESS: &str = "<hint.uploadSuccess>";
const HINT_UPLOADING: &str = "<hint.uploading>";

// ── Config types ──

/// Global metadata for the AutoUpload plugin (stored in `PluginMetadatas`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct AutoUploadPluginMeta {
    pub enabled: bool,
    pub auto_add: bool,
}

impl Default for AutoUploadPluginMeta {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add: false,
        }
    }
}

// ── Handler ───────

pub struct AutoUploadPlugin;

impl AutoUploadPlugin {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl super::PluginHandler for AutoUploadPlugin {
    async fn after_game_exit(&self, ctx: PluginContext) -> Result<()> {
        let game = {
            let lock = crate::db::CONFIG.lock();
            lock.get_game_by_id(ctx.game_id)?.clone()
        };
        let game_name = game.name.clone();

        if game.save_paths.is_empty() {
            log::info!(
                "AutoUploadPlugin: game {} has no save paths, skipping",
                ctx.game_id
            );
            return Ok(());
        }

        let data_dir = ctx.app.path().app_local_data_dir()?;
        let game_backup_dir = data_dir.join("backup").join(ctx.game_id.to_string());

        let (archive_conf, device_name, storage, varmap, io_timeout, non_io_timeout) = {
            let lock = crate::db::CONFIG.lock();
            let device_name = lock
                .get_device()
                .map(|d| d.name.clone())
                .unwrap_or_else(|| format!("Unknown{}", lock.devices.len()));
            (
                lock.settings.archive.clone(),
                device_name,
                lock.settings.storage.clone(),
                lock.varmap().clone(),
                std::time::Duration::from_secs(lock.settings.sync_io_timeout_secs.max(1) as u64),
                std::time::Duration::from_secs(lock.settings.sync_non_io_timeout_secs.max(1) as u64),
            )
        };

        // Create local archive
        log::info!("AutoUploadPlugin: archiving saves for game {}", ctx.game_id);
        let archive_filename = match crate::archive::archive_impl(
            &device_name,
            &archive_conf,
            game_backup_dir,
            game.save_paths,
        ) {
            Ok(filename) => filename,
            Err(e) => {
                let msg = format!("{HINT_ARCHIVE_FAILED}{game_name}: {e}");
                log::error!("AutoUpload: {msg}");
                emit_toast(&ctx.app, ToastVariant::Error, msg);
                return Err(e);
            }
        };

        // Upload to remote if storage is configured
        if storage.is_not_set() {
            log::warn!("AutoUploadPlugin: storage not configured, skipping upload");
            return Ok(());
        }

        // Show loading toast while uploading
        let loading_toast_id = format!("auto_upload_{}", ctx.game_id);
        emit_loading_toast(
            &ctx.app,
            format!("{HINT_UPLOADING}{game_name}"),
            &loading_toast_id,
        );

        let op = match storage.build_operator_with_timeouts(
            &ctx.app,
            &varmap,
            io_timeout,
            non_io_timeout,
        ) {
            Ok(op) => op,
            Err(e) => {
                dismiss_toast(&ctx.app, &loading_toast_id);
                let msg = format!("{HINT_UPLOAD_FAILED}{game_name}: {e}");
                log::error!("AutoUpload: {msg}");
                emit_toast(&ctx.app, ToastVariant::Error, msg);
                return Err(e);
            }
        };

        // Dispatch before_save_upload hooks
        let tx = Transaction::new();
        if let Err(e) =
            dispatch_before_save_upload(&ctx.app, ctx.game_id, &archive_filename, tx.clone()).await
        {
            tx.rollback();
            dismiss_toast(&ctx.app, &loading_toast_id);
            let msg = format!("{HINT_UPLOAD_FAILED}{game_name}: {e}");
            log::error!("AutoUpload: {msg}");
            emit_toast(&ctx.app, ToastVariant::Error, msg);
            return Err(e);
        }

        if let Err(e) = op
            .upload_archive(ctx.game_id, &archive_filename, &data_dir.join("backup"))
            .await
        {
            tx.rollback();
            dismiss_toast(&ctx.app, &loading_toast_id);
            let msg = format!("{HINT_UPLOAD_FAILED}{game_name}: {e}");
            log::error!("AutoUpload: {msg}");
            emit_toast(&ctx.app, ToastVariant::Error, msg);
            return Err(e);
        }

        // Dispatch after_save_upload hooks (non-fatal)
        dispatch_after_save_upload(&ctx.app, ctx.game_id, &archive_filename, tx.clone()).await;
        tx.execute_after_exit();

        dismiss_toast(&ctx.app, &loading_toast_id);
        let msg = format!("{HINT_UPLOAD_SUCCESS}{game_name}");
        log::info!("AutoUpload: {msg}");
        emit_toast(&ctx.app, ToastVariant::Success, msg);
        Ok(())
    }
}

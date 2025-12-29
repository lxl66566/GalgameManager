pub mod archive;
mod bindings;
pub mod db;
pub mod error;
pub mod exec;
pub mod http;
pub mod sync;
pub mod utils;

use bindings::*;
use tauri_plugin_fs::FsExt;

use crate::db::CONFIG_DIR;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            device_id,
            resolve_var,
            get_config,
            save_config,
            list_local_archive,
            delete_local_archive,
            rename_local_archive,
            archive,
            extract,
            get_image,
            list_archive,
            upload_archive,
            delete_archive,
            pull_archive,
            rename_remote_archive,
            clean_current_operator,
            exec
        ])
        .setup(|app| {
            let scope = app.fs_scope();
            scope.allow_directory(CONFIG_DIR.as_path(), true)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

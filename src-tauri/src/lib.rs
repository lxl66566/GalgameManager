mod bindings;
pub mod db;
pub mod error;

use bindings::{get_config, save_config};
use db::device::device_id;
use db::resolve_var;
use tauri_plugin_fs::FsExt;

use crate::db::CONFIG_DIR;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        // .plugin(
        //     tauri_plugin_sql::Builder::default()
        //         .add_migrations("sqlite:data.db", db::migrations())
        //         .build(),
        // )
        .invoke_handler(tauri::generate_handler![
            device_id,
            resolve_var,
            get_config,
            save_config
        ])
        .setup(|app| {
            let scope = app.fs_scope();
            scope.allow_directory(CONFIG_DIR.as_path(), true)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub mod archive;
mod bindings;
pub mod db;
pub mod error;
pub mod exec;
pub mod http;
pub mod sync;
pub mod utils;

use bindings::*;
use tauri::{
    generate_context,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

use crate::db::CONFIG_DIR;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            device_id,
            resolve_var,
            set_sort_type,
            get_sort_type,
            get_config,
            save_config,
            list_local_archive,
            delete_local_archive,
            delete_local_archive_all,
            rename_local_archive,
            archive,
            extract,
            get_image,
            list_archive,
            upload_archive,
            delete_archive,
            delete_archive_all,
            pull_archive,
            rename_remote_archive,
            clean_current_operator,
            upload_config,
            upload_config_safe,
            get_remote_config,
            exec,
            is_game_running,
            running_game_ids,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                _ = app
                    .handle()
                    .plugin(tauri_plugin_window_state::Builder::default().build());
                _ = app
                    .get_webview_window("main")
                    .unwrap()
                    .restore_state(StateFlags::POSITION | StateFlags::SIZE);
            }

            let open_config_folder =
                MenuItem::with_id(app, "open_config", "Open Config Folder", true, None::<&str>)?;
            let open_save_folder =
                MenuItem::with_id(app, "open_save", "Open Save Folder", true, None::<&str>)?;
            let quit_nosync = MenuItem::with_id(
                app,
                "quit_nosync",
                "Quit (without sync)",
                true,
                None::<&str>,
            )?;
            let quit_sync = MenuItem::with_id(app, "quit_sync", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &open_config_folder,
                    &open_save_folder,
                    &quit_nosync,
                    &quit_sync,
                ],
            )?;
            #[allow(clippy::single_match)]
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit_sync" => {
                        app.exit(114514);
                    }
                    "quit_nosync" => {
                        app.exit(0);
                    }
                    "open_config" => _ = opener::open(CONFIG_DIR.as_os_str()),
                    "open_save" => {
                        _ = opener::open(
                            app.path()
                                .app_local_data_dir()
                                .expect("failed to get app local data dir")
                                .join("backup"),
                        )
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .build(generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::WindowEvent {
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                api.prevent_close();
                app.get_webview_window("main").unwrap().hide().unwrap();
                // minimize notification
                let seen_path = CONFIG_DIR.join("minimize_seen");
                if !seen_path.exists() {
                    _ = app
                        .notification()
                        .builder()
                        .title(env!("CARGO_PKG_NAME"))
                        .body("GalgameManager is running in the background")
                        .show();
                    _ = std::fs::File::create(seen_path);
                }

                // upload config
                tauri::async_runtime::spawn(async move {
                    println!("[minimize] uploading config...");
                    match bindings::upload_config_safe().await {
                        Ok(true) => println!("[minimize] upload config success"),
                        Ok(false) => {
                            println!("[minimize] remote config is newer, not uploading")
                        }
                        Err(e) => println!("[minimize] failed to upload config: {e}"),
                    }
                });
            }
            tauri::RunEvent::ExitRequested { api, code, .. } => {
                _ = app.save_window_state(StateFlags::all());
                if code == Some(114514) {
                    app.get_webview_window("main").unwrap().minimize().unwrap();
                    api.prevent_exit();
                    println!("[exit] uploading config...");
                    let res = tauri::async_runtime::block_on(async move {
                        bindings::upload_config_safe().await
                    });
                    match res {
                        Ok(true) => println!("[exit] upload config success"),
                        Ok(false) => {
                            println!("[exit] remote config is newer, not uploading")
                        }
                        Err(e) => {
                            println!("[exit] failed to upload config: {e}");
                            _ = app
                                .notification()
                                .builder()
                                .title(env!("CARGO_PKG_NAME"))
                                .body(format!("Failed to upload config on exit: {e}"))
                                .show();
                            std::thread::sleep(std::time::Duration::from_secs(1)); // needed for notification to show
                            std::process::exit(1);
                        }
                    }
                    std::process::exit(0);
                } else {
                    println!("exit code: {:?}", code);
                }
            }
            _ => (),
        });
}

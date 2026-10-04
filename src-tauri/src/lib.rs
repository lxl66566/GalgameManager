#![allow(clippy::unreadable_literal)] // actuallly its readable ^o^
#![allow(clippy::needless_borrows_for_generic_args)] // https://github.com/rust-lang/rust-clippy/issues/17717

pub mod archive;
mod bindings;
pub mod color;
pub mod db;
pub mod error;
pub mod exec;
pub mod http;
mod logging;
pub mod plugin;
pub mod steam;
pub mod sync;
pub mod utils;

use bindings::{
    apply_remote_config, archive, clean_current_operator, clear_all_cover_colors,
    clear_all_daily_playtime, config_was_corrupted, delete_archive, delete_archive_all,
    delete_local_archive, delete_local_archive_all, device_id, exec, extract, get_config,
    get_remote_config, is_game_running, list_archive, list_local_archive, list_steam_games, log,
    open_game_dir, patch_config, paths_exist, prepare_image, pull_archive,
    refresh_all_cover_colors, rename_local_archive, rename_remote_archive, resolve_var,
    running_game_ids, save_config, upload_archive, upload_config,
};
use log::{error, info, warn};
use sync::UploadConfigStatus;
use tauri::{
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, generate_context,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

use crate::{
    db::{CONFIG, CONFIG_DIR},
    logging::{LOG_HANDLE, init_logger},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // The main window is only ever hidden (CloseRequested is
            // prevented), so this should always exist — but with release
            // `panic = "abort"` an expect here would take down the already
            // running instance, the exact opposite of what the user wants
            // when relaunching the app.
            if let Some(handle) = app.get_webview_window("main") {
                let _ = handle.show();
                let _ = handle.unminimize();
                let _ = handle.set_focus();
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            config_was_corrupted,
            save_config,
            patch_config,
            device_id,
            resolve_var,
            log,
            list_local_archive,
            delete_local_archive,
            delete_local_archive_all,
            rename_local_archive,
            archive,
            extract,
            prepare_image,
            refresh_all_cover_colors,
            clear_all_cover_colors,
            list_archive,
            upload_archive,
            delete_archive,
            delete_archive_all,
            pull_archive,
            rename_remote_archive,
            clean_current_operator,
            upload_config,
            get_remote_config,
            apply_remote_config,
            exec,
            is_game_running,
            running_game_ids,
            open_game_dir,
            paths_exist,
            list_steam_games,
            clear_all_daily_playtime,
        ])
        .register_uri_scheme_protocol("galimg", |_, request| http::image_protocol_handler(request))
        .setup(|app| {
            let handle = init_logger(app.path().app_log_dir()?)?;
            let res = LOG_HANDLE.set(handle);
            debug_assert!(res.is_ok());

            // Spawn the config-writer task first so every later CONFIG
            // mutation can rely on it. See [`db::saver`] for the rationale.
            let _ = db::saver::ConfigSaver::init(app.handle());

            // Remove persistent VoiceSpeedup residue (SPEEDUP user env var,
            // MMDevAPI COM redirect) if the previous instance was killed
            // mid-session and its Transaction cleanups never ran.
            utils::audio_speed_hack::cleanup_crashed_session();

            #[cfg(desktop)]
            {
                _ = app
                    .handle()
                    .plugin(tauri_plugin_window_state::Builder::default().build());
            }

            // Inject the on-disk Config into window.__INITIAL_CONFIG__ via
            // initialization_script (runs before any page script), so the
            // frontend createStore can consume it directly. Saves one
            // get_config IPC round-trip on startup and makes Rust's
            // Config::default() the single source of truth (no frontend
            // DEFAULT_CONFIG to drift).
            let config_json = serde_json::to_string(&*CONFIG.lock())
                .expect("config serialization should not fail");

            let main_window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("GalgameManager")
                    .inner_size(800.0, 600.0)
                    .resizable(true)
                    .center();
            #[cfg(windows)]
            let main_window = main_window.drag_and_drop(true);
            let main_window = main_window
                .user_agent("github:lxl66566/GalgameManager")
                .initialization_script(format!("window.__INITIAL_CONFIG__ = {config_json};"))
                .build()?;

            #[cfg(desktop)]
            {
                _ = main_window.restore_state(StateFlags::POSITION | StateFlags::SIZE);
            }

            let language = CONFIG.lock().settings.appearance.language.clone();
            let [
                open_config_label,
                open_save_label,
                open_log_label,
                quit_nosync_label,
                quit_label,
            ] = tray_menu_labels(&language);
            let open_config_folder =
                MenuItem::with_id(app, "open_config", open_config_label, true, None::<&str>)?;
            let open_save_folder =
                MenuItem::with_id(app, "open_save", open_save_label, true, None::<&str>)?;
            let open_log_folder =
                MenuItem::with_id(app, "open_log", open_log_label, true, None::<&str>)?;
            let quit_nosync =
                MenuItem::with_id(app, "quit_nosync", quit_nosync_label, true, None::<&str>)?;
            let quit_sync = MenuItem::with_id(app, "quit_sync", quit_label, true, None::<&str>)?;
            let menu = Menu::with_items(app, &[
                &open_config_folder,
                &open_save_folder,
                &open_log_folder,
                &quit_nosync,
                &quit_sync,
            ])?;
            #[allow(clippy::single_match)]
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("GalgameManager")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit_sync" => {
                        app.exit(114514);
                    },
                    "quit_nosync" => {
                        app.exit(0);
                    },
                    "open_config" => _ = opener::open(CONFIG_DIR.as_os_str()),
                    "open_save" => {
                        if let Ok(dir) = app.path().app_local_data_dir() {
                            _ = opener::open(dir.join("backup"));
                        }
                    },
                    "open_log" => {
                        if let Ok(dir) = app.path().app_log_dir() {
                            _ = opener::open(dir);
                        }
                    },
                    _ => {},
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
                    },
                    _ => {},
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
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
                // minimize notification
                let seen_path = CONFIG_DIR.join("minimize_seen");
                if !seen_path.exists() {
                    notify(
                        app,
                        env!("CARGO_PKG_NAME"),
                        "GalgameManager is running in the background",
                    );
                    _ = std::fs::File::create(seen_path);
                }

                // upload config
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    info!("[minimize] uploading config...");
                    let res = upload_config(app.clone(), true).await;
                    match res {
                        Ok(UploadConfigStatus::Uploaded) => {
                            info!("[minimize] upload config success");
                            notify(
                                &app,
                                "\u{2705} Synced",
                                "Configuration uploaded successfully",
                            );
                        },
                        Ok(UploadConfigStatus::LocalClean) => {
                            warn!("[minimize] local clean, skip upload");
                            notify(
                                &app,
                                "\u{23ed} Sync Skipped",
                                "Local configuration is up to date",
                            );
                        },
                        Ok(UploadConfigStatus::Conflict) => {
                            warn!("[minimize] conflict detected");
                            notify(
                                &app,
                                "\u{26a0}\u{fe0f} Sync Conflict",
                                "Remote configuration is newer \u{2014} please pull first",
                            );
                        },
                        Err(e) => {
                            error!("[minimize] failed to upload config: {e}");
                            notify(
                                &app,
                                "\u{274c} Sync Failed",
                                &format!("Failed to upload configuration: {e}"),
                            );
                        },
                    }
                });
            },
            tauri::RunEvent::ExitRequested { api, code, .. } => {
                _ = app.save_window_state(StateFlags::all());
                // Flush config before anything else so a pending throttled
                // write is never lost on exit.
                db::saver::ConfigSaver::force_save_blocking("app_exit");
                if code == Some(114514) {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.minimize();
                    }
                    api.prevent_exit();
                    sync_and_exit(app);
                } else {
                    info!("exit code: {code:?}");
                }
            },
            _ => (),
        });
}

fn tray_menu_labels(language: &str) -> [&'static str; 5] {
    if language == "zh-CN" {
        [
            "打开配置文件夹",
            "打开存档文件夹",
            "打开日志文件夹",
            "退出（不同步）",
            "退出",
        ]
    } else {
        [
            "Open Config Folder",
            "Open Save Folder",
            "Open Log Folder",
            "Quit (without sync)",
            "Quit",
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::tray_menu_labels;

    #[test]
    fn tray_menu_labels_follow_configured_language() {
        assert_eq!(
            tray_menu_labels("zh-CN"),
            [
                "打开配置文件夹",
                "打开存档文件夹",
                "打开日志文件夹",
                "退出（不同步）",
                "退出",
            ]
        );
        assert_eq!(
            tray_menu_labels("en-US"),
            [
                "Open Config Folder",
                "Open Save Folder",
                "Open Log Folder",
                "Quit (without sync)",
                "Quit",
            ]
        );
        assert_eq!(tray_menu_labels("unknown"), tray_menu_labels("en-US"));
    }
}

/// Show a desktop notification off the current thread.
///
/// notify-rust's sync `show()` ends in `zbus::block_on`; our AT-SPI dep unifies
/// zbus with the `tokio` feature, so that call runs `Runtime::block_on` on a fresh
/// runtime and panics on tokio worker threads.
fn notify(app: &AppHandle, title: &str, body: &str) {
    let app = app.clone();
    let title = title.to_string();
    let body = body.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        _ = app.notification().builder().title(title).body(body).show();
    });
}

/// Upload config then exit. Called when the user clicks "Quit (with sync)".
fn sync_and_exit(app: &AppHandle) {
    info!("[exit] uploading config...");
    let res = tauri::async_runtime::block_on(async move { upload_config(app.clone(), true).await });
    // upload_config force-queues its last_sync flush on the writer task
    // (non-blocking); block here so it — plus any config write that happened
    // during the upload window — hits disk before process::exit kills the
    // writer.
    db::saver::ConfigSaver::force_save_blocking("sync_and_exit");
    match res {
        Ok(UploadConfigStatus::Uploaded) => {
            info!("[exit] upload config success");
            notify(
                app,
                "\u{2705} Synced",
                "Configuration uploaded successfully",
            );
            before_exit();
            std::thread::sleep(std::time::Duration::from_secs(1));
            std::process::exit(0);
        },
        Ok(UploadConfigStatus::LocalClean) => {
            warn!("[exit] local clean, skip upload");
            notify(
                app,
                "\u{23ed} Sync Skipped",
                "Local configuration is up to date",
            );
            before_exit();
            std::thread::sleep(std::time::Duration::from_secs(1));
            std::process::exit(0);
        },
        Ok(UploadConfigStatus::Conflict) => {
            warn!("[exit] conflict detected");
            notify(
                app,
                "\u{26a0}\u{fe0f} Sync Conflict",
                "Remote configuration is newer \u{2014} please pull first",
            );
            before_exit();
            std::thread::sleep(std::time::Duration::from_secs(1));
            std::process::exit(0);
        },
        Err(e) => {
            error!("[exit] failed to upload config: {e}");
            notify(
                app,
                "\u{274c} Sync Failed",
                &format!("Failed to upload configuration: {e}"),
            );
            before_exit();
            std::thread::sleep(std::time::Duration::from_secs(1));
            std::process::exit(1);
        },
    }
}

fn before_exit() {
    if let Some(handle) = LOG_HANDLE.get() {
        handle.flush();
    }
}

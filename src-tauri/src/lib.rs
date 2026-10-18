#![allow(clippy::unreadable_literal)] // actuallly its readable ^o^
#![allow(clippy::needless_borrows_for_generic_args)] // https://github.com/rust-lang/rust-clippy/issues/17717

// Backend i18n: compile-time embedded JSON dictionaries under `locales/`.
// Adding a language = dropping a new `locales/<locale>.json` file in; missing
// keys fall back to en-US. The macro must be invoked at the crate root.
rust_i18n::i18n!("locales", fallback = "en-US");

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
pub mod tray;
pub mod utils;

use bindings::{
    apply_remote_config, archive, clean_current_operator, clear_all_cover_colors,
    clear_all_daily_playtime, config_was_corrupted, delete_archive, delete_archive_all,
    delete_local_archive, delete_local_archive_all, device_id, exec, extract, get_config,
    get_remote_config, is_game_running, list_archive, list_local_archive, list_steam_games, log,
    open_game_dir, patch_config, paths_exist, prepare_image, pull_archive,
    refresh_all_cover_colors, rename_local_archive, rename_remote_archive, resolve_var,
    running_game_ids, save_config, test_storage_connection, upload_archive, upload_config,
};
use log::{error, info, warn};
use rust_i18n::t;
use sync::UploadConfigStatus;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, generate_context};
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
            test_storage_connection,
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

            // The locale must be synced before the tray menu is built.
            sync_locale_from_config();
            tray::setup(app.handle())?;
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
                    notify(app, env!("CARGO_PKG_NAME"), &t!("notify.minimized"));
                    _ = std::fs::File::create(seen_path);
                }

                // upload config. Skipped when no storage backend is
                // configured: uploading would just fail and pop a scary
                // "Sync Failed" notification.
                if CONFIG.lock().settings.storage.is_not_set() {
                    info!("[minimize] storage not configured, skipping config upload");
                } else {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        info!("[minimize] uploading config...");
                        let res = upload_config(app.clone(), true).await;
                        match &res {
                            Ok(UploadConfigStatus::Uploaded) => {
                                info!("[minimize] upload config success");
                            },
                            Ok(UploadConfigStatus::LocalClean) => {
                                warn!("[minimize] local clean, skip upload");
                            },
                            Ok(UploadConfigStatus::Conflict) => {
                                warn!("[minimize] conflict detected");
                            },
                            Err(e) => {
                                error!("[minimize] failed to upload config: {e}");
                            },
                        }
                        notify_upload_result(&app, &res);
                    });
                }
            },
            tauri::RunEvent::ExitRequested { api, code, .. } => {
                _ = app.save_window_state(StateFlags::all());
                // Flush the partial playtime chunks of still-running games
                // before anything else: the game loops only persist whole
                // SAVE_INTERVAL chunks, so without this the final (<60s)
                // chunk of a live session is lost — on both exit paths, and
                // ahead of the config save/upload which snapshots CONFIG.
                let running = exec::flush_running_playtime(app);
                if running > 0 {
                    info!(
                        "[exit] {running} game(s) still running; pending playtime flushed, they \
                         will be closed"
                    );
                    notify(
                        app,
                        env!("CARGO_PKG_NAME"),
                        &t!("notify.gamesStillRunning", count = running),
                    );
                }
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

/// Sync rust-i18n's global locale from the app config. Called at startup
/// and whenever a config patch changes the language (see
/// `bindings::patch_config`, which also rebuilds the tray menu).
pub(crate) fn sync_locale_from_config() {
    let language = CONFIG.lock().settings.appearance.language.clone();
    rust_i18n::set_locale(&language);
}

/// Desktop notification for an upload-config result, shared by the minimize
/// handler and the "Quit (with sync)" exit path.
fn notify_upload_result(app: &AppHandle, res: &error::Result<UploadConfigStatus>) {
    let (title, body): (String, String) = match res {
        Ok(UploadConfigStatus::Uploaded) => (
            t!("notify.syncedTitle").into_owned(),
            t!("notify.syncedBody").into_owned(),
        ),
        Ok(UploadConfigStatus::LocalClean) => (
            t!("notify.syncSkippedTitle").into_owned(),
            t!("notify.syncSkippedBody").into_owned(),
        ),
        Ok(UploadConfigStatus::Conflict) => (
            t!("notify.syncConflictTitle").into_owned(),
            t!("notify.syncConflictBody").into_owned(),
        ),
        Err(e) => (
            t!("notify.syncFailedTitle").into_owned(),
            t!("notify.syncFailedBody", error = e.to_string()).into_owned(),
        ),
    };
    notify(app, &title, &body);
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
    // Games keep accumulating playtime between the ExitRequested flush and
    // this upload; flush again so the uploaded config carries it (the flush
    // is idempotent — only fresh time is picked up).
    let flushed = exec::flush_running_playtime(app);
    if flushed > 0 {
        info!("[exit] flushed pending playtime for {flushed} game(s) before upload");
    }
    let res = tauri::async_runtime::block_on(async move { upload_config(app.clone(), true).await });
    // upload_config force-queues its last_sync flush on the writer task
    // (non-blocking); block here so it — plus any config write that happened
    // during the upload window — hits disk before process::exit kills the
    // writer.
    db::saver::ConfigSaver::force_save_blocking("sync_and_exit");
    match &res {
        Ok(UploadConfigStatus::Uploaded) => info!("[exit] upload config success"),
        Ok(UploadConfigStatus::LocalClean) => warn!("[exit] local clean, skip upload"),
        Ok(UploadConfigStatus::Conflict) => warn!("[exit] conflict detected"),
        Err(e) => error!("[exit] failed to upload config: {e}"),
    }
    notify_upload_result(app, &res);
    before_exit();
    std::thread::sleep(std::time::Duration::from_secs(1));
    std::process::exit(i32::from(res.is_err()));
}

fn before_exit() {
    if let Some(handle) = LOG_HANDLE.get() {
        handle.flush();
    }
}

#[cfg(test)]
mod i18n_tests {
    use std::collections::HashSet;

    use rust_i18n::t;

    /// Every locale file must cover the full en-US key set, so a missing
    /// translation fails here instead of shipping fallback text. Scales to
    /// new languages: dropping another `locales/*.json` in extends the check.
    #[test]
    fn all_locales_cover_the_fallback_key_set() {
        let dir = format!("{}/locales", env!("CARGO_MANIFEST_DIR"));
        let base: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(format!("{dir}/en-US.json")).unwrap())
                .unwrap();
        let base_keys: HashSet<&str> = base
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        for locale in rust_i18n::available_locales!() {
            let file = std::fs::read_to_string(format!("{dir}/{locale}.json")).unwrap();
            let value: serde_json::Value = serde_json::from_str(&file).unwrap();
            let keys: HashSet<&str> = value
                .as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect();
            let missing: Vec<&str> = base_keys.difference(&keys).copied().collect();
            assert!(missing.is_empty(), "{locale} is missing keys: {missing:?}");
        }
    }

    #[test]
    fn t_translates_and_interpolates() {
        rust_i18n::set_locale("zh-CN");
        assert_eq!(t!("tray.quit"), "退出");
        assert_eq!(t!("hint.uploading", game = "X"), "正在上传: X...");
        rust_i18n::set_locale("en-US");
        assert_eq!(t!("tray.quit"), "Quit");
    }
}

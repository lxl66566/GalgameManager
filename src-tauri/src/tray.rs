//! Tray icon: menu construction and locale-driven rebuilds.
//!
//! Menu labels are translated with the backend i18n (`locales/*.json`,
//! see `lib.rs`). The menu is rebuilt whenever the config language changes,
//! so switching languages in the settings UI applies without a restart
//! (see `bindings::patch_config`).

use rust_i18n::t;
use tauri::{
    AppHandle, Manager, Wry,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::db::CONFIG_DIR;

/// Stable tray id so the icon can be looked up again for menu rebuilds.
const TRAY_ID: &str = "main";

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let open_config = MenuItem::with_id(
        app,
        "open_config",
        t!("tray.openConfig"),
        true,
        None::<&str>,
    )?;
    let open_save = MenuItem::with_id(app, "open_save", t!("tray.openSave"), true, None::<&str>)?;
    let open_log = MenuItem::with_id(app, "open_log", t!("tray.openLog"), true, None::<&str>)?;
    let quit_nosync = MenuItem::with_id(
        app,
        "quit_nosync",
        t!("tray.quitNoSync"),
        true,
        None::<&str>,
    )?;
    let quit_sync = MenuItem::with_id(app, "quit_sync", t!("tray.quit"), true, None::<&str>)?;
    Menu::with_items(app, &[
        &open_config,
        &open_save,
        &open_log,
        &quit_nosync,
        &quit_sync,
    ])
}

/// Build the tray icon with its initial menu. Called once from app setup,
/// after [`crate::sync_locale_from_config`].
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    #[allow(clippy::single_match)]
    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().expect("app icon").clone())
        .tooltip(env!("CARGO_PKG_NAME"))
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
}

/// Rebuild the tray menu with the current locale (idempotent; used after a
/// language change).
pub fn refresh_menu(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        log::warn!("tray icon {TRAY_ID} not found, skipping menu rebuild");
        return;
    };
    match build_menu(app) {
        Ok(menu) => {
            if let Err(e) = tray.set_menu(Some(menu)) {
                log::error!("Failed to set rebuilt tray menu: {e}");
            }
        },
        Err(e) => log::error!("Failed to rebuild tray menu: {e}"),
    }
}

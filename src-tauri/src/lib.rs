pub mod archive;
mod bindings;
pub mod db;
pub mod error;
pub mod exec;
pub mod http;
pub mod sync;
pub mod utils;

use bindings::*;
use tauri::generate_context;

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
            upload_config,
            get_remote_config,
            exec
        ])
        .setup(|_app| Ok(()))
        .build(generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            #[allow(clippy::single_match)]
            match event {
                tauri::RunEvent::ExitRequested { api, code, .. } => {
                    if code.is_none() {
                        api.prevent_exit();
                        tauri::async_runtime::block_on(async move {
                            println!("uploading config...");
                            let res = upload_config().await;
                            if let Err(e) = res {
                                println!("failed to upload config: {e}");
                            }
                        });
                        std::process::exit(0);
                    } else {
                        println!("exit code: {:?}", code);
                    }
                }
                _ => (),
            }
        });
}

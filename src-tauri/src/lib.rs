pub mod db;
pub mod error;
use db::device::device_id;
use db::resolve_var;
use specta_typescript::Typescript;
use tauri_specta::{collect_commands, Builder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new().commands(collect_commands![resolve_var, device_id]);
    #[cfg(debug_assertions)] // <- Only export on non-release builds
    builder
        .export(Typescript::default(), "../src/bindings.ts")
        .expect("Failed to export typescript bindings");
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(builder.invoke_handler())
        // .plugin(
        //     tauri_plugin_sql::Builder::default()
        //         .add_migrations("sqlite:data.db", db::migrations())
        //         .build(),
        // )
        // Add your commands here that you will call from your JS code
        // .invoke_handler(tauri::generate_handler![ /* Add your commands here */ ])
        .setup(move |app| {
            builder.mount_events(app);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

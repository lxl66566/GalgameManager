mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:data.db", db::migrations())
                .build(),
        )
        // Add your commands here that you will call from your JS code
        // .invoke_handler(tauri::generate_handler![ /* Add your commands here */ ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

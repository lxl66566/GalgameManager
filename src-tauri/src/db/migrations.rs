use tauri_plugin_sql::{Migration, MigrationKind};

#[doc = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../docs/dev.md"))]
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_tables",
        sql: "CREATE TABLE IF NOT EXISTS config (
            id INTEGER PRIMARY KEY,
            config TEXT,
            version INTEGER
        );
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE,
            path TEXT,
            image_data BLOB,
            image_mime_type TEXT,
            image_url TEXT,
            time UNSIGNED BIG INT,
            chain TEXT
        );
        CREATE TABLE IF NOT EXISTS plugins (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE,
            path TEXT,
            sole_start BOOLEAN,
            start_func TEXT
        );",
        kind: MigrationKind::Up,
    }]
}

//! Config serialization compatibility tests.
//!
//! These are integration tests (not inline unit tests) because they treat
//! the `app_lib` crate as a black box, exercising the public API exactly
//! the way the on-disk format is consumed: round-tripping a `Config`
//! through TOML and asserting that historical config fragments still
//! deserialize without data loss.

use app_lib::db::{Config, Game, TimeCmp};
use chrono::{DateTime, Utc};

/// A realistically-populated config that touches every field which has
/// ever been the source of a migration / deserializer compat fix.
fn sample_config() -> Config {
    let mut cfg = Config {
        db_version: 1,
        ..Default::default()
    };
    cfg.last_updated = DateTime::parse_from_rfc3339("2024-05-01T10:00:00Z")
        .unwrap()
        .with_timezone(&Utc);
    cfg.last_sync = Some(
        DateTime::parse_from_rfc3339("2024-04-30T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
    );
    cfg.games.push(Game {
        id: 42,
        name: "Sample".into(),
        excutable_path: Some("/games/sample.exe".into()),
        save_paths: vec!["{home}/save".into()],
        image_url: Some("http://example/x.png".into()),
        image_sha256: Some("deadbeef".into()),
        added_time: DateTime::parse_from_rfc3339("2024-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc),
        use_time: chrono::Duration::seconds(3661),
        last_played_time: Some(
            DateTime::parse_from_rfc3339("2024-05-01T09:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        ),
        last_upload_time: None,
        plugins: vec![],
    });
    cfg
}

#[test]
fn config_toml_roundtrip_preserves_all_fields() {
    let original = sample_config();
    let serialized = toml::to_string(&original).expect("serialize config");
    let deserialized: Config = toml::from_str(&serialized).expect("deserialize config");
    // Verify a handful of representative fields; if any of them silently
    // became default on the way back, that's a real bug.
    assert_eq!(deserialized.db_version, original.db_version);
    assert_eq!(deserialized.last_updated, original.last_updated);
    assert_eq!(deserialized.last_sync, original.last_sync);
    assert_eq!(deserialized.games.len(), 1);
    let g = &deserialized.games[0];
    assert_eq!(g.id, 42);
    assert_eq!(g.name, "Sample");
    assert_eq!(g.save_paths, vec!["{home}/save"]);
    assert_eq!(g.use_time, chrono::Duration::seconds(3661));
    assert!(g.last_played_time.is_some());
}

#[test]
fn config_roundtrip_preserves_game_time_comparison() {
    // A config that round-trips through TOML must keep its games'
    // use_time / last_played_time intact enough to pass the sync-time
    // consistency check against itself.
    let original = sample_config();
    let serialized = toml::to_string(&original).unwrap();
    let deserialized: Config = toml::from_str(&serialized).unwrap();
    assert!(
        original
            .check_games_time_compare(&deserialized, TimeCmp::Equal)
            .is_ok()
    );
}

#[test]
fn legacy_v0_config_with_last_uploaded_only_deserializes() {
    // Pre-1.0 configs stored `lastUploaded` and `dbVersion = 0`. The serde
    // `default` annotations + #[deprecated] field keep them parseable.
    // Note: `Config` uses `rename_all = "camelCase"` so on-disk keys are
    // camelCase regardless of the Rust field names.
    let toml_str = r#"
dbVersion = 0
lastUpdated = "2024-01-01T00:00:00Z"
lastUploaded = "2024-01-02T00:00:00Z"
games = []
devices = []
"#;
    let parsed: Config = toml::from_str(toml_str).expect("legacy v0 config should parse");
    assert_eq!(parsed.db_version, 0);
    #[allow(deprecated)]
    {
        assert!(parsed.last_uploaded.is_some());
    }
}

#[test]
fn local_storage_accepts_legacy_string_form() {
    // The `local` field used to be a plain string ("path") before becoming
    // a struct. The compat deserializer must accept both.
    let toml_str = r#"
[settings.storage]
provider = "local"
local = "/legacy/path"
"#;
    let parsed: Config = toml::from_str(toml_str).expect("legacy local field should parse");
    assert_eq!(parsed.settings.storage.local.path, "/legacy/path");
}

#[test]
fn local_storage_accepts_new_struct_form() {
    let toml_str = r#"
[settings.storage]
provider = "local"
[settings.storage.local]
path = "/new/path"
"#;
    let parsed: Config = toml::from_str(toml_str).expect("new local struct should parse");
    assert_eq!(parsed.settings.storage.local.path, "/new/path");
}

use std::cell::RefCell;

use chrono::DateTime;
use serde::{Deserialize, Deserializer};

use super::{
    Config,
    settings::{LocalConfig, Settings},
};
use crate::plugin::PluginMetadatas;

impl Default for Config {
    #[allow(deprecated)]
    fn default() -> Self {
        Self {
            db_version: 1,
            last_updated: DateTime::default(),
            last_sync: Option::default(),
            last_uploaded: Option::default(),
            games: Vec::default(),
            devices: Vec::default(),
            settings: Settings::default(),
            plugin_metadatas: PluginMetadatas::default(),
        }
    }
}

pub fn deserialize_local_config_compat<'de, D>(deserializer: D) -> Result<LocalConfig, D::Error>
where
    D: Deserializer<'de>,
{
    // Helper enum to handle the polymorphic type
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum LocalConfigOrString {
        // Legacy config: local = "..."
        Path(String),
        // New config: local = { inner = "..." }
        Config(LocalConfig),
    }

    let helper = LocalConfigOrString::deserialize(deserializer)?;

    match helper {
        LocalConfigOrString::Path(path) => Ok(LocalConfig {
            path,
            operator: RefCell::default(),
        }),
        LocalConfigOrString::Config(config) => Ok(config),
    }
}

#[allow(deprecated)]
pub fn migrate(mut config: Config) -> Config {
    if config.db_version == 0 {
        if config.last_sync.is_none() {
            std::mem::swap(&mut config.last_sync, &mut config.last_uploaded);
        }
        config.db_version = 1;
    }
    config
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Utc};

    use super::*;

    #[allow(deprecated)]
    fn base_v0_config() -> Config {
        Config {
            db_version: 0,
            last_updated: DateTime::parse_from_rfc3339("2024-01-01T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
            last_sync: None,
            last_uploaded: None,
            games: vec![],
            devices: vec![],
            settings: Settings::default(),
            plugin_metadatas: PluginMetadatas::default(),
        }
    }

    #[test]
    #[allow(deprecated)]
    fn migrate_v0_swaps_last_uploaded_into_last_sync() {
        let ts = DateTime::parse_from_rfc3339("2024-05-06T07:08:09Z")
            .unwrap()
            .with_timezone(&Utc);
        let mut cfg = base_v0_config();
        cfg.last_uploaded = Some(ts);
        let migrated = migrate(cfg);
        assert_eq!(migrated.db_version, 1);
        assert_eq!(migrated.last_sync, Some(ts));
        assert_eq!(migrated.last_uploaded, None);
    }

    #[test]
    #[allow(deprecated)]
    fn migrate_v0_keeps_last_sync_when_already_present() {
        // If both fields are populated, last_sync wins and last_uploaded is
        // left untouched (data preservation).
        let ts_sync = DateTime::parse_from_rfc3339("2024-05-06T07:08:09Z")
            .unwrap()
            .with_timezone(&Utc);
        let ts_uploaded = DateTime::parse_from_rfc3339("2024-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let mut cfg = base_v0_config();
        cfg.last_sync = Some(ts_sync);
        cfg.last_uploaded = Some(ts_uploaded);
        let migrated = migrate(cfg);
        assert_eq!(migrated.db_version, 1);
        assert_eq!(migrated.last_sync, Some(ts_sync));
        assert_eq!(migrated.last_uploaded, Some(ts_uploaded));
    }

    #[test]
    fn migrate_is_idempotent_for_v1() {
        // Already-migrated configs pass through unchanged.
        let cfg = Config::default();
        assert_eq!(cfg.db_version, 1);
        let migrated = migrate(cfg.clone());
        assert_eq!(migrated.db_version, 1);
        assert_eq!(migrated.last_sync, cfg.last_sync);
    }

    #[test]
    fn deserialize_local_config_accepts_plain_string() {
        #[derive(Deserialize)]
        struct Wrap {
            #[serde(deserialize_with = "deserialize_local_config_compat")]
            local: LocalConfig,
        }
        // Legacy config: local = "/path/to/dir"
        let toml_str = r#"local = "/legacy""#;
        let w: Wrap = toml::from_str(toml_str).unwrap();
        assert_eq!(w.local.path, "/legacy");
    }

    #[test]
    fn deserialize_local_config_accepts_struct() {
        #[derive(Deserialize)]
        struct Wrap {
            #[serde(deserialize_with = "deserialize_local_config_compat")]
            local: LocalConfig,
        }
        // New config: local = { path = "/new" }
        let toml_str = r#"local = { path = "/new" }"#;
        let w: Wrap = toml::from_str(toml_str).unwrap();
        assert_eq!(w.local.path, "/new");
    }
}

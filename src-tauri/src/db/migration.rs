use serde::{Deserialize, Deserializer};

use super::{Config, settings::LocalConfig};

impl Default for Config {
    #[allow(deprecated)]
    fn default() -> Self {
        Self {
            db_version: 1,
            last_updated: Default::default(),
            last_sync: Default::default(),
            last_uploaded: Default::default(),
            games: Default::default(),
            devices: Default::default(),
            settings: Default::default(),
            plugin_metadatas: Default::default(),
        }
    }
}

pub fn deserialize_local_config_compat<'de, D>(deserializer: D) -> Result<LocalConfig, D::Error>
where
    D: Deserializer<'de>,
{
    // 定义一个辅助 Enum 来处理多态类型
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum LocalConfigOrString {
        // 兼容旧配置：local = "..."
        Path(String),
        // 兼容新配置：local = { inner = "..." }
        // 直接复用 LocalConfig 的默认反序列化逻辑
        Config(LocalConfig),
    }

    // 尝试反序列化为辅助 Enum
    let helper = LocalConfigOrString::deserialize(deserializer)?;

    match helper {
        // 如果是字符串，手动构造 LocalConfig
        LocalConfigOrString::Path(path) => Ok(LocalConfig {
            path,
            operator: Default::default(),
        }),
        // 如果已经是结构体，直接返回
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
            settings: Default::default(),
            plugin_metadatas: Default::default(),
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
        // Legacy config: local = "/path/to/dir"
        let toml_str = r#"local = "/legacy""#;
        #[derive(Deserialize)]
        struct Wrap {
            #[serde(deserialize_with = "deserialize_local_config_compat")]
            local: LocalConfig,
        }
        let w: Wrap = toml::from_str(toml_str).unwrap();
        assert_eq!(w.local.path, "/legacy");
    }

    #[test]
    fn deserialize_local_config_accepts_struct() {
        // New config: local = { path = "/new" }
        let toml_str = r#"local = { path = "/new" }"#;
        #[derive(Deserialize)]
        struct Wrap {
            #[serde(deserialize_with = "deserialize_local_config_compat")]
            local: LocalConfig,
        }
        let w: Wrap = toml::from_str(toml_str).unwrap();
        assert_eq!(w.local.path, "/new");
    }
}

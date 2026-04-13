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

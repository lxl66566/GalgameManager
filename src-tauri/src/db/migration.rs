use serde::{Deserialize, Deserializer};

use super::settings::LocalConfig;

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

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::archive::ArchiveConfig;

#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Settings {
    pub storage: StorageConfig,
    pub archive: ArchiveConfig,
    pub appearance: AppearanceConfig,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum StorageProvider {
    #[default]
    Local,
    WebDav,
    S3,
}

// 2. 修改：StorageConfig 现在持有所有配置 + 当前激活的 Provider
#[derive(Debug, Default, PartialEq, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct StorageConfig {
    pub provider: StorageProvider, // 当前选中的后端
    pub local: String,             // Local 配置 (路径)
    pub webdav: WebDavConfig,      // WebDAV 配置
    pub s3: S3Config,              /* S3 配置
                                    * pub auto_sync_interval: u32, // 0 = off */
}

#[derive(Debug, PartialEq, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConfig {
    pub endpoint: String,
    pub username: String,
    pub password: Option<String>,
    #[serde(default = "default_root_path")]
    pub root_path: String,
}

fn default_root_path() -> String {
    concat!("/", env!("CARGO_PKG_NAME")).to_string()
}

impl Default for WebDavConfig {
    fn default() -> Self {
        Self {
            endpoint: "".to_string(),
            username: "".to_string(),
            password: None,
            root_path: default_root_path(),
        }
    }
}

#[derive(Debug, PartialEq, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub access_key: String,
    pub secret_key: String,
}

impl Default for S3Config {
    fn default() -> Self {
        Self {
            bucket: env!("CARGO_PKG_NAME").to_string(),
            region: "".to_string(),
            endpoint: None,
            access_key: "".to_string(),
            secret_key: "".to_string(),
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    Light,
    Dark,
    #[default]
    System,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceConfig {
    pub theme: ThemeMode,
    pub language: String,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub name: String,
    pub uuid: String,
    pub variables: HashMap<String, String>,
}

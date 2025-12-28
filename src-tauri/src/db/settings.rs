use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::archive::ArchiveConfig;

#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub storage: StorageConfig,
    pub archive: ArchiveConfig,
    pub appearance: AppearanceConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(tag = "type", content = "config", rename_all = "camelCase")]
pub enum StorageBackend {
    WebDav(WebDavConfig),
    S3(S3Config),
    Local(String),
}

impl Default for StorageBackend {
    fn default() -> Self {
        Self::Local(String::new())
    }
}

#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct StorageConfig {
    pub backend: StorageBackend,
    // pub auto_sync_interval: u32, // 0 = off
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConfig {
    pub endpoint: String,
    pub username: String,
    pub password: Option<String>,
    pub root_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub access_key: String,
    pub secret_key: String,
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

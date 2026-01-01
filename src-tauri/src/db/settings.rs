use std::cell::RefCell;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::migration::deserialize_local_config_compat;
use crate::{
    archive::ArchiveConfig,
    db::device::VarMap,
    error::{Error, Result},
    sync::{BuildOperator, LocalOperator, MyOperation},
};

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Settings {
    pub storage: StorageConfig,
    pub archive: ArchiveConfig,
    pub appearance: AppearanceConfig,
    /// in secs
    pub auto_sync_interval: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            storage: Default::default(),
            archive: Default::default(),
            appearance: Default::default(),
            auto_sync_interval: 1200,
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum StorageProvider {
    #[default]
    None,
    Local,
    WebDav,
    S3,
}

// 2. 修改：StorageConfig 现在持有所有配置 + 当前激活的 Provider
#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct StorageConfig {
    pub provider: StorageProvider, // 当前选中的后端
    #[serde(deserialize_with = "deserialize_local_config_compat")]
    pub local: LocalConfig, // Local 配置 (路径)
    pub webdav: WebDavConfig,      // WebDAV 配置
    pub s3: S3Config,              // S3 配置
}

impl StorageConfig {
    #[inline]
    pub fn is_not_set(&self) -> bool {
        matches!(self.provider, StorageProvider::None)
    }

    pub fn build_operator(&self, varmap: &VarMap) -> Result<Box<dyn MyOperation + Send + Sync>> {
        match self.provider {
            StorageProvider::Local => self.local.get_operator_or_init(varmap),
            StorageProvider::WebDav => self.webdav.get_operator_or_init(&()),
            StorageProvider::S3 => self.s3.get_operator_or_init(&()),
            _ => Err(Error::ProviderNotSet),
        }
    }

    pub fn clean_current_operator(&self) {
        match self.provider {
            StorageProvider::Local => self.local.remove_operator(),
            StorageProvider::WebDav => self.webdav.remove_operator(),
            StorageProvider::S3 => self.s3.remove_operator(),
            _ => {}
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfig {
    pub path: String,

    #[serde(skip)]
    pub operator: RefCell<Option<LocalOperator>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConfig {
    pub endpoint: String,
    pub username: String,
    pub password: Option<String>,
    pub root_path: String,

    #[serde(skip)]
    pub operator: RefCell<Option<opendal::Operator>>,
}

impl Default for WebDavConfig {
    fn default() -> Self {
        Self {
            endpoint: "".to_string(),
            username: "".to_string(),
            password: None,
            root_path: concat!("/", env!("CARGO_PKG_NAME")).to_string(),
            operator: RefCell::new(None),
        }
    }
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

    #[serde(skip)]
    pub operator: RefCell<Option<opendal::Operator>>,
}

impl Default for S3Config {
    fn default() -> Self {
        Self {
            bucket: env!("CARGO_PKG_NAME").to_string(),
            region: "".to_string(),
            endpoint: None,
            access_key: "".to_string(),
            secret_key: "".to_string(),
            operator: RefCell::new(None),
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
    pub variables: VarMap,
}

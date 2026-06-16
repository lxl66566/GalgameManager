use std::cell::RefCell;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use ts_rs::TS;

use super::migration::deserialize_local_config_compat;
use crate::{
    archive::ArchiveConfig,
    db::device::VarMap,
    error::{Error, Result},
    sync::{
        BuildOperator, DEFAULT_IO_TIMEOUT, DEFAULT_NON_IO_TIMEOUT, LocalOperator, MyOperation,
        S3Operator, WebdavOperator,
    },
};

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Settings {
    pub storage: StorageConfig,
    pub archive: ArchiveConfig,
    pub appearance: AppearanceConfig,
    pub launch: LaunchConfig,
    /// in secs
    pub auto_sync_interval: u32,
    /// IO timeout for remote sync operations (upload/download), in seconds.
    pub sync_io_timeout_secs: u32,
    /// Non-IO timeout for remote sync operations (connection/listing), in
    /// seconds.
    pub sync_non_io_timeout_secs: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            storage: Default::default(),
            archive: Default::default(),
            appearance: Default::default(),
            launch: Default::default(),
            auto_sync_interval: 1200,
            sync_io_timeout_secs: DEFAULT_IO_TIMEOUT.as_secs() as u32,
            sync_non_io_timeout_secs: DEFAULT_NON_IO_TIMEOUT.as_secs() as u32,
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

    pub fn build_operator(
        &self,
        app: &AppHandle,
        varmap: &VarMap,
    ) -> Result<Box<dyn MyOperation + Send + Sync>> {
        self.build_operator_with_timeouts(app, varmap, DEFAULT_IO_TIMEOUT, DEFAULT_NON_IO_TIMEOUT)
    }

    pub fn build_operator_with_timeouts(
        &self,
        app: &AppHandle,
        varmap: &VarMap,
        io_timeout: std::time::Duration,
        non_io_timeout: std::time::Duration,
    ) -> Result<Box<dyn MyOperation + Send + Sync>> {
        match self.provider {
            StorageProvider::Local => {
                self.local
                    .get_operator_or_init(varmap, io_timeout, non_io_timeout)
            }
            StorageProvider::WebDav => {
                self.webdav
                    .get_operator_or_init(app, io_timeout, non_io_timeout)
            }
            StorageProvider::S3 => self
                .s3
                .get_operator_or_init(app, io_timeout, non_io_timeout),
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
#[serde(default)]
pub struct LocalConfig {
    pub path: String,

    #[serde(skip)]
    pub operator: RefCell<Option<LocalOperator>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct WebDavConfig {
    pub endpoint: String,
    pub username: String,
    pub password: Option<String>,
    pub root_path: String,

    #[serde(skip)]
    pub operator: RefCell<Option<WebdavOperator>>,
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
#[serde(default)]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    pub access_key: String,
    pub secret_key: String,

    #[serde(skip)]
    pub operator: RefCell<Option<S3Operator>>,
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

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct LaunchConfig {
    /// 统计游玩时长启用精确模式
    pub precision_mode: bool,
}

impl Default for LaunchConfig {
    fn default() -> Self {
        Self {
            precision_mode: true,
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

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AppearanceConfig {
    pub theme: ThemeMode,
    pub language: String,
    pub time_display: TimeDisplayConfig,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            theme: ThemeMode::System,
            language: sys_locale::get_locale().unwrap_or_else(|| "en-US".to_string()),
            time_display: Default::default(),
        }
    }
}

/// Which language the home-page "last played" timestamp should render
/// in, independent of the global UI language.
#[derive(Debug, Default, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum TimeLanguage {
    /// Follow the global UI language.
    #[default]
    Auto,
    /// Force English regardless of the UI language.
    En,
    /// Force Simplified Chinese regardless of the UI language.
    Zh,
}

/// Display style for the home-page "last played" timestamp.
#[derive(Debug, Default, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum TimeFormat {
    /// "2 days ago" / "2d ago" — current behavior.
    #[default]
    Relative,
    /// Fixed strftime-like formatted string (see `absolute_format`).
    Absolute,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct TimeDisplayConfig {
    pub language: TimeLanguage,
    pub format: TimeFormat,
    /// Token-based format used when `format == Absolute`.
    ///
    /// Supported tokens (moment/dayjs-style):
    /// `YYYY` `YY` `MM` `DD` `HH` `mm` `ss`.
    /// Default: `"YYYY-MM-DD HH:mm"`.
    pub absolute_format: String,
}

impl Default for TimeDisplayConfig {
    fn default() -> Self {
        Self {
            language: TimeLanguage::Auto,
            format: TimeFormat::Relative,
            absolute_format: "YYYY-MM-DD HH:mm".to_string(),
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum SortType {
    #[default]
    Id,
    Name,
    LastPlayed,
    PlayTime,
}

impl SortType {
    pub fn as_str(&self) -> &'static str {
        match self {
            SortType::Id => "id",
            SortType::Name => "name",
            SortType::LastPlayed => "lastPlayed",
            SortType::PlayTime => "playTime",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "id" => Some(SortType::Id),
            "name" => Some(SortType::Name),
            "lastPlayed" => Some(SortType::LastPlayed),
            "playTime" => Some(SortType::PlayTime),
            _ => None,
        }
    }
}

pub mod device;

use std::{collections::HashMap, path::PathBuf};

use crate::error::Result;
use chrono::{DateTime, Duration, Utc};
use config_file2::{LoadConfigFile, Storable};
use device::DEVICE_UID;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock as Lazy;
use strfmt::strfmt;

pub static CONFIG_PATH: Lazy<PathBuf> = Lazy::new(|| {
    home::home_dir()
        .expect("cannot find home dir on your OS!")
        .join(env!("CARGO_PKG_NAME"))
        .join("config.toml")
});

pub static CONFIG: Lazy<Mutex<Config>> = Lazy::new(|| {
    Mutex::new(Config::load_or_default(CONFIG_PATH.as_path()).expect("load config file failed!"))
});

impl Storable for Config {
    fn path(&self) -> impl AsRef<std::path::Path> {
        CONFIG_PATH.as_path()
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub db_version: u32,
    pub last_updated: DateTime<Utc>,
    pub games: Vec<Game>,
    pub devices: Vec<Device>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub name: String,
    pub excutable_path: Option<String>,
    pub save_paths: Vec<String>,
    pub image_url: Option<String>,
    pub image_sha256: Option<String>,
    pub added_time: DateTime<Utc>,
    pub last_played_time: Option<DateTime<Utc>>,
    pub use_time: Duration,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub name: String,
    pub uid: String,
    pub variables: HashMap<String, String>,
}

static DEFAULT_DEVICE: Lazy<Device> = Lazy::new(Device::default);

impl Config {
    #[inline]
    pub fn get_device(&self) -> Option<&Device> {
        self.devices.iter().find(|d| d.uid == *DEVICE_UID)
    }

    #[inline]
    pub fn get_device_mut(&mut self) -> Option<&mut Device> {
        self.devices.iter_mut().find(|d| d.uid == *DEVICE_UID)
    }
}

#[tauri::command]
pub fn resolve_var(s: impl AsRef<str>) -> Result<String> {
    let lock = CONFIG.lock();
    let device = lock.get_device().unwrap_or(&*DEFAULT_DEVICE);
    Ok(strfmt(s.as_ref(), &device.variables)?)
}

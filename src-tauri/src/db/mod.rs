pub mod device;
pub mod settings;

use std::{fs, path::PathBuf, sync::LazyLock as Lazy};

use chrono::{DateTime, Duration, Utc};
use config_file2::{LoadConfigFile, Storable};
use device::{Device, DEVICE_UID};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use settings::Settings;
use ts_rs::TS;

pub static CONFIG_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let dir = home::home_dir()
        .expect("cannot find home dir on your OS!")
        .join(".config")
        .join(env!("CARGO_PKG_NAME"));
    _ = fs::create_dir_all(&dir);
    dir
});

pub static CONFIG_PATH: Lazy<PathBuf> = Lazy::new(|| CONFIG_DIR.join("config.toml"));

pub static CONFIG: Lazy<Mutex<Config>> = Lazy::new(|| {
    Mutex::new(Config::load_or_default(CONFIG_PATH.as_path()).expect("load config file failed!"))
});

impl Storable for Config {
    fn path(&self) -> impl AsRef<std::path::Path> {
        CONFIG_PATH.as_path()
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub db_version: u32,
    pub last_updated: DateTime<Utc>,
    pub games: Vec<Game>,
    pub devices: Vec<Device>,
    pub settings: Settings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: u32,
    pub name: String,
    pub excutable_path: Option<String>,
    pub save_paths: Vec<String>,
    pub image_url: Option<String>,
    pub image_sha256: Option<String>,
    pub added_time: DateTime<Utc>,
    pub use_time: Duration,
    pub last_played_time: Option<DateTime<Utc>>,
    pub last_upload_time: Option<DateTime<Utc>>,
}

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

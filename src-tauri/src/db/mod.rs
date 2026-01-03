pub mod device;
mod migration;
pub mod settings;

use std::{fs, path::PathBuf, sync::LazyLock as Lazy};

use chrono::{DateTime, Duration, Utc};
use config_file2::{LoadConfigFile, Storable};
pub use device::ResolveVar;
use device::{Device, DEVICE_UID};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use settings::Settings;
use tauri::{AppHandle, Emitter as _};
use ts_rs::TS;

use crate::{db::device::VarMap, error::Result};

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
#[serde(default)]
pub struct Config {
    pub db_version: u32,
    /// The last time the config was updated from frontend
    pub last_updated: DateTime<Utc>,
    /// The last time the config was uploaded to remote storage
    pub last_uploaded: Option<DateTime<Utc>>,
    pub games: Vec<Game>,
    pub devices: Vec<Device>,
    pub settings: Settings,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Game {
    pub id: u32,
    pub name: String,
    pub excutable_path: Option<String>,
    pub save_paths: Vec<String>,
    pub image_url: Option<String>,
    pub image_sha256: Option<String>,
    pub added_time: DateTime<Utc>,
    /// [secs, nanos]
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

    #[inline]
    pub fn varmap(&self) -> Result<&VarMap> {
        let device = self
            .get_device()
            .ok_or_else(|| crate::error::Error::Device("No device found".to_string()))?;
        Ok(&device.variables)
    }

    #[inline]
    pub fn resolve_var(&self, s: &str) -> Result<String> {
        self.varmap()?.resolve_var(s)
    }

    #[inline]
    pub fn get_game_by_id(&self, id: u32) -> Result<&Game> {
        self.games
            .iter()
            .find(|g| g.id == id)
            .ok_or_else(|| crate::error::Error::GameNotFound)
    }

    #[inline]
    pub fn get_game_by_id_mut(&mut self, id: u32) -> Result<&mut Game> {
        self.games
            .iter_mut()
            .find(|g| g.id == id)
            .ok_or_else(|| crate::error::Error::GameNotFound)
    }

    #[inline]
    pub fn save_and_emit(&self, app_handle: &AppHandle) -> Result<()> {
        self.store()?;
        app_handle.emit("config://updated", self)?;
        Ok(())
    }
}

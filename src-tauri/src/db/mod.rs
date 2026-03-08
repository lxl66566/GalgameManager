pub mod device;
mod migration;
pub mod settings;

use std::{fs, path::PathBuf, sync::LazyLock as Lazy};

use chrono::{DateTime, Duration, Utc};
use config_file2::{LoadConfigFile, Storable};
pub use device::ResolveVar;
use device::{DEVICE_UID, Device};
use log::warn;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use settings::Settings;
use tauri::{AppHandle, Emitter as _};
use ts_rs::TS;

use crate::{
    db::{device::VarMap, migration::migrate},
    error::{Error, Result},
};

pub static CONFIG_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let dir = home::home_dir()
        .expect("cannot find home dir on your OS!")
        .join(".config")
        .join(env!("CARGO_PKG_NAME"));
    _ = fs::create_dir_all(&dir);
    dir
});

pub static CONFIG_FILENAME: &str = "config.toml";
pub static CONFIG_PATH: Lazy<PathBuf> = Lazy::new(|| CONFIG_DIR.join(CONFIG_FILENAME));

pub static CONFIG: Lazy<Mutex<Config>> = Lazy::new(|| {
    Mutex::new(migrate(
        Config::load_or_default(CONFIG_PATH.as_path()).expect("load config file failed!"),
    ))
});

impl Storable for Config {
    fn path(&self) -> impl AsRef<std::path::Path> {
        CONFIG_PATH.as_path()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Config {
    pub db_version: u32,
    /// The last time the config was updated from frontend
    pub last_updated: DateTime<Utc>,
    /// The last time the config was uploaded to remote or downloaded from
    /// remote
    pub last_sync: Option<DateTime<Utc>>,
    #[deprecated(note = "use last_sync instead")]
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
    pub fn varmap(&self) -> &VarMap {
        static DEFAULT_VARMAP: Lazy<VarMap> = Lazy::new(VarMap::default);
        self.get_device()
            .map(|d| &d.variables)
            .unwrap_or(&DEFAULT_VARMAP)
    }

    #[inline]
    pub fn resolve_var(&self, s: &str) -> Result<String> {
        self.varmap().resolve_var(s)
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

    /// Check if games last_played_time and use_time are not older than
    /// other_config
    ///
    /// # Parameters
    ///
    /// - other_config: the other config to compare with
    /// - cmp: the **expected** comparison of time.
    ///
    /// # Returns
    ///
    /// - Ok(()): if check passed
    /// - Err(Error::GameTimeCheckFailed): if check failed
    pub fn check_games_time_compare(&self, other_config: &Config, cmp: TimeCmp) -> Result<()> {
        let mut self_games = self.games.iter().collect::<Vec<_>>();
        let mut other_games = other_config.games.iter().collect::<Vec<_>>();
        self_games.sort_by_key(|g| g.id);
        other_games.sort_by_key(|g| g.id);
        let (mut idx_self, mut idx_other) = (0, 0);

        while idx_self < self_games.len() && idx_other < other_games.len() {
            let self_game = &self_games[idx_self];
            let other_game = &other_games[idx_other];
            if self_game.id == other_game.id {
                if let Some(self_time) = self_game.last_played_time
                    && let Some(other_time) = other_game.last_played_time
                    && !cmp.cmp(self_time, other_time)
                {
                    let error_msg = format!(
                        "game {}, last_played_time check failed: {} {} other: {}",
                        self_game.name,
                        self_time,
                        cmp.as_str(),
                        other_time
                    );
                    warn!("{}", error_msg);
                    return Err(Error::GameTimeCheckFailed(
                        error_msg
                            + "\nIf you still want to continue, please manually upload/download config in settings page.",
                    ));
                }
                if !cmp.cmp(&self_game.use_time, &other_game.use_time) {
                    let error_msg = format!(
                        "game {}, use_time: {} {} other config: {}",
                        self_game.id,
                        self_game.use_time,
                        cmp.as_str(),
                        other_game.use_time
                    );
                    return Err(Error::GameTimeCheckFailed(
                        error_msg
                            + "\nIf you still want to continue, please manually upload/download config in settings page.",
                    ));
                }
                idx_self += 1;
                idx_other += 1;
            } else if self_game.id < other_game.id {
                idx_self += 1;
            } else {
                idx_other += 1;
            }
        }
        Ok(())
    }

    #[inline]
    pub fn save_and_emit(&mut self, app_handle: &AppHandle) -> Result<()> {
        self.last_updated = Utc::now();
        self.save_and_emit_no_update(app_handle)
    }

    /// Save config without updating last_updated. This is useful in some cases.
    #[inline]
    pub fn save_and_emit_no_update(&mut self, app_handle: &AppHandle) -> Result<()> {
        self.store()?;
        app_handle.emit("config://updated", &self)?;
        Ok(())
    }
}

pub enum TimeCmp {
    LessOrEqual,
    GreaterOrEqual,
    Equal,
    Less,
    Greater,
}

impl TimeCmp {
    #[inline]
    pub fn cmp<T: PartialOrd>(&self, a: T, b: T) -> bool {
        match self {
            TimeCmp::LessOrEqual => a <= b,
            TimeCmp::GreaterOrEqual => a >= b,
            TimeCmp::Equal => a == b,
            TimeCmp::Less => a < b,
            TimeCmp::Greater => a > b,
        }
    }

    #[inline]
    pub fn as_str(&self) -> &'static str {
        match self {
            TimeCmp::LessOrEqual => "<=",
            TimeCmp::GreaterOrEqual => ">=",
            TimeCmp::Equal => "==",
            TimeCmp::Less => "<",
            TimeCmp::Greater => ">",
        }
    }
}

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
    plugin::{
        PluginInstance, PluginMetadatas, deserialize_metadatas_fallback,
        deserialize_plugins_fallback,
    },
};

pub static CONFIG_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let dir = home::home_dir()
        .unwrap_or_else(|| {
            warn!("cannot find home dir; falling back to current directory");
            PathBuf::from(".")
        })
        .join(".config")
        .join(env!("CARGO_PKG_NAME"));
    _ = fs::create_dir_all(&dir);
    dir
});

pub static CONFIG_FILENAME: &str = "config.toml";
pub static CONFIG_PATH: Lazy<PathBuf> = Lazy::new(|| CONFIG_DIR.join(CONFIG_FILENAME));

pub static CONFIG: Lazy<Mutex<Config>> = Lazy::new(|| {
    let config = match Config::load_or_default(CONFIG_PATH.as_path()) {
        Ok(c) => c,
        Err(e) => {
            // A corrupted config used to panic the whole app on startup. Instead
            // back the broken file up so the user can recover it manually, then
            // start from a clean default.
            log::error!("failed to load config, using default: {e}");
            let backup = CONFIG_PATH.with_extension("toml.bak");
            let _ = fs::rename(CONFIG_PATH.as_path(), &backup);
            Config::default()
        }
    };
    Mutex::new(migrate(config))
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
    #[serde(deserialize_with = "deserialize_metadatas_fallback")]
    pub plugin_metadatas: PluginMetadatas,
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
    #[serde(
        skip_serializing_if = "Vec::is_empty",
        default,
        deserialize_with = "deserialize_plugins_fallback"
    )]
    pub plugins: Vec<PluginInstance>,
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

#[cfg(test)]
mod tests {
    use chrono::DateTime;

    use super::*;

    /// Helper: build a [`Config`] with the given (id, use_time_secs,
    /// last_played_time) tuples. `last_played_time` is given as epoch
    /// seconds (`None` => absent).
    fn config_with_games(spec: &[(u32, i64, Option<i64>)]) -> Config {
        let games = spec
            .iter()
            .map(|(id, secs, lpt)| Game {
                id: *id,
                name: format!("g{id}"),
                use_time: Duration::seconds(*secs),
                last_played_time: lpt.and_then(|t| DateTime::from_timestamp(t, 0)),
                ..Default::default()
            })
            .collect();
        Config {
            games,
            ..Default::default()
        }
    }

    #[test]
    fn time_cmp_str_roundtrip() {
        assert_eq!(TimeCmp::LessOrEqual.as_str(), "<=");
        assert_eq!(TimeCmp::GreaterOrEqual.as_str(), ">=");
        assert_eq!(TimeCmp::Equal.as_str(), "==");
        assert_eq!(TimeCmp::Less.as_str(), "<");
        assert_eq!(TimeCmp::Greater.as_str(), ">");
    }

    #[test]
    fn check_time_passes_when_self_ge_other() {
        // self use_time >= other use_time; both have last_played_time equal.
        let self_c = config_with_games(&[(1, 100, Some(50)), (2, 200, Some(40))]);
        let other = config_with_games(&[(1, 100, Some(50)), (2, 100, Some(40))]);
        assert!(
            self_c
                .check_games_time_compare(&other, TimeCmp::GreaterOrEqual)
                .is_ok()
        );
    }

    #[test]
    fn check_time_fails_when_self_lt_other() {
        let self_c = config_with_games(&[(1, 50, Some(50))]);
        let other = config_with_games(&[(1, 100, Some(50))]);
        let err = self_c
            .check_games_time_compare(&other, TimeCmp::GreaterOrEqual)
            .unwrap_err();
        assert!(matches!(err, Error::GameTimeCheckFailed(_)));
    }

    #[test]
    fn check_time_ignores_missing_last_played_time() {
        // Either side missing last_played_time skips that branch but
        // still compares use_time.
        let self_c = config_with_games(&[(1, 100, None)]);
        let other = config_with_games(&[(1, 100, Some(50))]);
        assert!(
            self_c
                .check_games_time_compare(&other, TimeCmp::GreaterOrEqual)
                .is_ok()
        );
    }

    #[test]
    fn check_time_handles_disjoint_game_ids() {
        // self has {1,3}, other has {2,3}: id=3 is compared, the rest skipped.
        let self_c = config_with_games(&[(1, 100, Some(10)), (3, 50, Some(20))]);
        let other = config_with_games(&[(2, 999, Some(999)), (3, 50, Some(20))]);
        assert!(
            self_c
                .check_games_time_compare(&other, TimeCmp::GreaterOrEqual)
                .is_ok()
        );
        // Mismatch on the shared id=3 should still fail.
        let other2 = config_with_games(&[(3, 60, Some(20))]);
        assert!(
            self_c
                .check_games_time_compare(&other2, TimeCmp::GreaterOrEqual)
                .is_err()
        );
    }

    #[test]
    fn check_time_last_played_failure_overrides_use_time() {
        let self_c = config_with_games(&[(1, 100, Some(10))]);
        let other = config_with_games(&[(1, 100, Some(99))]);
        // use_time equal but last_played_time: self < other, expected GE -> fail.
        assert!(matches!(
            self_c
                .check_games_time_compare(&other, TimeCmp::GreaterOrEqual)
                .unwrap_err(),
            Error::GameTimeCheckFailed(_)
        ));
    }
}

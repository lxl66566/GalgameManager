pub mod device;
mod migration;
pub mod saver;
pub mod settings;

use std::{collections::HashMap, fs, path::PathBuf, sync::LazyLock as Lazy};

use chrono::{DateTime, Duration, Utc};
use config_file2::{LoadConfigFile, Storable};
use device::{DEVICE_UID, Device};
pub use device::{DevicePatch, ResolveVar};
use log::warn;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use settings::Settings;
pub use settings::{
    AppearanceConfigPatch, LaunchConfigPatch, LocalConfigPatch, S3ConfigPatch, SettingsPatch,
    StorageConfigPatch, TimeDisplayConfigPatch, WebDavConfigPatch,
};
use struct_patch::Patch;
use tauri::{AppHandle, Emitter as _};
use ts_rs::TS;

// Re-export the auto-generated patch types so the `Patch` derive on `Config`
// (which references them by name) can find them in scope, and so other
// modules (e.g. `bindings::patch_config`) can take them as IPC arguments.
pub use crate::archive::ArchiveConfigPatch;
pub use crate::plugin::PluginMetadatasPatch;
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

#[derive(Debug, Clone, Serialize, Deserialize, TS, Patch)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
// Patch attributes:
// - The generated `ConfigPatch` gets serde/TS derives and the same camelCase rename so it
//   round-trips through the IPC JSON the same way `Config` does.
// - `skip_serializing_none` + per-field `serde(skip_serializing_if)` makes absent fields disappear
//   from the wire — that's how "no change for this field" is expressed.
// - `ts(optional)` on every field exposes them as optional (`T?`) on the TS side, matching the wire
//   behavior.
// - `no_diff`: the diff is computed on the TS side (where we already have the baseline), so we opt
//   out of `into_patch_by_diff`. That avoids forcing `PartialEq` on `Settings` (which contains
//   `RefCell` operator caches) and on every `PluginInstance` variant — they would otherwise need
//   PartialEq derived across ~15 config structs.
// - `db_version` / `last_updated` / `last_sync` / `last_uploaded` are skipped: they are system
//   bookkeeping owned by migration / sync / save itself; the frontend never legitimately edits
//   them, and including them would reopen the race (e.g. a stale `last_sync` racing with an
//   in-flight sync).
// - `games` uses `list_patch` keyed by `Game::id` so a single game's edit does not ship every other
//   game's `daily_playtime` HashMap over IPC. The TS-side type is overridden to a hand-written
//   `GameListOp` union because `ListPatchOp` itself does not derive `ts_rs::TS` — see
//   `src/lib/patch.ts` for the matching definition.
#[patch(no_diff)]
#[patch(attribute(derive(Debug, Default, Clone, Serialize, Deserialize, TS)))]
#[patch(attribute(ts(export)))]
#[patch(attribute(serde(rename_all = "camelCase", default)))]
pub struct Config {
    #[patch(skip)]
    pub db_version: u32,
    /// The last time the config was updated from frontend
    #[patch(skip)]
    pub last_updated: DateTime<Utc>,
    /// The last time the config was uploaded to remote or downloaded from
    /// remote
    #[patch(skip)]
    pub last_sync: Option<DateTime<Utc>>,
    #[deprecated(note = "use last_sync instead")]
    #[patch(skip)]
    pub last_uploaded: Option<DateTime<Utc>>,
    #[patch(list_patch(id = |g: &Game| g.id, id_type = u32))]
    // The TS type is overridden because `ListPatchOp` doesn't derive
    // `ts_rs::TS`. We inline an `import(...)` type so the generated
    // `ConfigPatch.ts` resolves `GameListOp` without ts-rs needing to know
    // about it — the alias `~/utils/patch` is wired up in `tsconfig.json`
    // (`paths`) and `vite.config.ts` (`resolve.alias`).
    #[patch(attribute(ts(type = "Array<import('~/utils/patch').GameListOp>")))]
    #[patch(attribute(serde(skip_serializing_if = "Vec::is_empty")))]
    #[patch(attribute(ts(optional)))]
    pub games: Vec<Game>,
    // Like `games`, `devices` uses id-addressed list patching (keyed by
    // `Device::uid`) so renaming the current device or adding a variable
    // doesn't ship every other device over IPC.
    #[patch(list_patch(id = |d: &Device| d.uid.clone(), id_type = String))]
    #[patch(attribute(ts(type = "Array<import('~/utils/patch').DeviceListOp>")))]
    #[patch(attribute(serde(skip_serializing_if = "Vec::is_empty")))]
    #[patch(attribute(ts(optional)))]
    pub devices: Vec<Device>,
    #[patch(nesting)]
    #[patch(attribute(serde(default)))]
    pub settings: Settings,
    #[serde(deserialize_with = "deserialize_metadatas_fallback")]
    #[patch(nesting)]
    #[patch(attribute(serde(default)))]
    pub plugin_metadatas: PluginMetadatas,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, Patch)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
// Same patch attributes as `Config`: camelCase round-trip, optional-on-wire.
// `no_diff` for the same reason (diff happens TS-side; avoids forcing
// `PartialEq` on `PluginInstance` and its ~15 sub-config structs).
// `id` is skipped because it is the list-patch address — letting the frontend
// mutate it would orphan the game from its patch ops.
// `Option<T>` fields use `skip_wrap` so the patch keeps the original
// `Option<T>` type: `None` = no change, `Some(v)` = set. We accept the
// "can't distinguish clear from no-op" trade-off in the patch path — a real
// clear should go through `save_config` if it ever needs to be unambiguous.
#[patch(no_diff)]
#[patch(attribute(derive(Debug, Default, Clone, Serialize, Deserialize, TS)))]
#[patch(attribute(ts(export)))]
#[patch(attribute(serde(rename_all = "camelCase", default)))]
pub struct Game {
    #[patch(skip)]
    pub id: u32,
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub name: String,
    #[patch(skip_wrap)]
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub excutable_path: Option<String>,
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub save_paths: Vec<String>,
    #[patch(skip_wrap)]
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub image_url: Option<String>,
    #[patch(skip_wrap)]
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub image_sha256: Option<String>,
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub added_time: DateTime<Utc>,
    /// [secs, nanos]
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub use_time: Duration,
    #[patch(skip_wrap)]
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub last_played_time: Option<DateTime<Utc>>,
    #[patch(skip_wrap)]
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub last_upload_time: Option<DateTime<Utc>>,
    /// Daily playtime owned by this game: date (YYYY-MM-DD) -> seconds played.
    /// Lives on the game (not the Config root) so it migrates, syncs and is
    /// cleared together with the rest of the game's state.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub daily_playtime: HashMap<String, u32>,
    /// Cover-derived accent color (CSS hex, e.g. "#1f80c8") used by the
    /// statistics charts. Extracted once via `prepare_image` and cached here
    /// so repeat renders are free. Cleared by the frontend whenever the cover
    /// URL changes, so a new cover gets a fresh color on its next load.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[patch(skip_wrap)]
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub cover_color: Option<String>,
    #[serde(
        skip_serializing_if = "Vec::is_empty",
        default,
        deserialize_with = "deserialize_plugins_fallback"
    )]
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
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

    /// Emit `config://updated` and request a *throttled* save through the
    /// global [`ConfigSaver`](saver::ConfigSaver). The change reaches disk
    /// within `MIN_INTERVAL`, at most once per window. `last_updated` is
    /// **not** bumped here. File I/O happens on the writer task, so the
    /// `CONFIG` mutex is never held across disk writes.
    #[inline]
    pub fn save_and_emit_no_update(&self, app_handle: &AppHandle) -> Result<()> {
        app_handle.emit("config://updated", &self)?;
        saver::ConfigSaver::request("save_and_emit_no_update");
        Ok(())
    }

    /// Same as [`save_and_emit_no_update`] but also bumps `last_updated`.
    /// Use this when the mutation originates from the frontend or another
    /// "real" user action; reserve the `_no_update` variant for internal
    /// bookkeeping (e.g. `last_sync`).
    #[inline]
    pub fn save_and_emit(&mut self, app_handle: &AppHandle) -> Result<()> {
        self.last_updated = Utc::now();
        self.save_and_emit_no_update(app_handle)
    }

    /// Emit, then request an *immediate* save that bypasses the throttle.
    /// Use only for critical paths (remote config apply, game exit) where
    /// waiting `MIN_INTERVAL` could lose data.
    ///
    /// The write itself is queued to the single writer task (non-blocking,
    /// so the caller may hold the `CONFIG` mutex); serialising forced and
    /// throttled writes through one task is what prevents a stale
    /// throttled snapshot from overwriting a newer forced write.
    #[inline]
    pub fn force_save_and_emit_no_update(&self, app_handle: &AppHandle) -> Result<()> {
        app_handle.emit("config://updated", &self)?;
        if !saver::ConfigSaver::request_force("force_save_and_emit_no_update") {
            // Saver not initialised (early startup): write through directly.
            self.store()?;
        }
        Ok(())
    }

    /// Same as [`force_save_and_emit_no_update`] but also bumps
    /// `last_updated`.
    #[inline]
    pub fn force_save_and_emit(&mut self, app_handle: &AppHandle) -> Result<()> {
        self.last_updated = Utc::now();
        self.force_save_and_emit_no_update(app_handle)
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

    // ── Patch behavior ───────────────────────────────────────────────────
    //
    // The headline race this fixes: frontend holds a snapshot, user edits a
    // game's name, and in the meantime the game loop bumps `use_time`. The
    // old `save_config` overwrite would revert `use_time`. A patch must not.

    #[test]
    fn patch_preserves_backend_use_time_when_frontend_edits_name() {
        // Baseline snapshot the frontend received (use_time = 100).
        let mut backend = config_with_games(&[(1, 100, None)]);
        // Game loop bumps use_time to 200 on the backend, independent of the
        // frontend's stale snapshot.
        backend.games[0].use_time = Duration::seconds(200);
        backend.games[0].last_played_time = Some(
            DateTime::parse_from_rfc3339("2024-06-01T00:00:00Z")
                .unwrap()
                .with_timezone(&Utc),
        );

        // Frontend sends a patch that only touches the name. use_time is
        // absent from the sub-patch (because the frontend never edited it).
        let patch = ConfigPatch {
            games: vec![struct_patch::list::ListPatchOp::modify(
                1u32,
                GamePatch {
                    name: Some("edited".into()),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        backend.apply(patch);

        // Name came from the patch, use_time / last_played_time from the backend.
        assert_eq!(backend.games[0].name, "edited");
        assert_eq!(backend.games[0].use_time, Duration::seconds(200));
        assert!(backend.games[0].last_played_time.is_some());
    }

    #[test]
    fn patch_modify_unknown_id_is_silently_ignored() {
        // Stale op against a game the backend has already deleted must not
        // panic and must leave the config untouched.
        let mut backend = config_with_games(&[(1, 100, None)]);
        backend.apply(ConfigPatch {
            games: vec![struct_patch::list::ListPatchOp::modify(
                999u32,
                GamePatch {
                    name: Some("ghost".into()),
                    ..Default::default()
                },
            )],
            ..Default::default()
        });
        assert_eq!(backend.games.len(), 1);
        assert_eq!(backend.games[0].name, "g1");
    }

    #[test]
    fn patch_delete_then_modify_same_id_is_no_op() {
        let mut backend = config_with_games(&[(1, 100, None), (2, 50, None)]);
        backend.apply(ConfigPatch {
            games: vec![
                struct_patch::list::ListPatchOp::delete(1u32),
                // Modify on a now-deleted id: ignored.
                struct_patch::list::ListPatchOp::modify(
                    1u32,
                    GamePatch {
                        name: Some("late".into()),
                        ..Default::default()
                    },
                ),
            ],
            ..Default::default()
        });
        assert_eq!(backend.games.len(), 1);
        assert_eq!(backend.games[0].id, 2);
    }

    #[test]
    fn patch_append_adds_a_new_game() {
        let mut backend = config_with_games(&[(1, 100, None)]);
        let new_game = Game {
            id: 5,
            name: "five".into(),
            ..Default::default()
        };
        backend.apply(ConfigPatch {
            games: vec![struct_patch::list::ListPatchOp::append(new_game.clone())],
            ..Default::default()
        });
        assert_eq!(backend.games.len(), 2);
        assert_eq!(backend.games[1].id, 5);
        assert_eq!(backend.games[1].name, "five");
    }

    #[test]
    fn patch_skipped_fields_are_not_in_config_patch() {
        // db_version / last_updated / last_sync / last_uploaded are #[patch(skip)].
        let empty = Config::new_empty_patch();
        // The skipped fields don't even exist on ConfigPatch — compile-time
        // guarantee. We assert that an empty patch is empty (the Status
        // impl's is_empty).
        use struct_patch::Status as _;
        assert!(empty.is_empty());
    }

    // ── Nested patches: Settings / PluginMetadatas / Device ───────────────
    //
    // These prove the deep-nesting work pays off: a single leaf flip
    // (e.g. `appearance.theme`) reaches the backend as a tiny patch and
    // leaves every other field of `Settings` untouched — including the
    // `RefCell` operator caches (LocalConfig.operator, etc.), which is
    // exactly why we can't just derive PartialEq and use into_patch_by_diff.

    #[test]
    fn settings_patch_modifies_one_leaf_without_touching_others() {
        use crate::db::settings::{LaunchConfig, Settings};
        let mut settings = Settings::default();
        let original_storage = settings.storage.clone();
        let original_auto_sync = settings.auto_sync_interval;

        // Patch only `launch.daily_stat`. The nesting lets us address this
        // one bool without sending the rest of Settings.
        settings.apply(SettingsPatch {
            launch: LaunchConfigPatch {
                daily_stat: Some(false),
                ..Default::default()
            },
            ..Default::default()
        });

        assert!(!settings.launch.daily_stat);
        // Untouched:
        assert_eq!(
            settings.launch.precision_mode,
            LaunchConfig::default().precision_mode
        );
        // StorageConfig is Clone + Debug but not PartialEq (has RefCell
        // operator caches); compare debug repr instead.
        assert_eq!(
            format!("{:?}", settings.storage),
            format!("{:?}", original_storage)
        );
        assert_eq!(settings.auto_sync_interval, original_auto_sync);
    }

    #[test]
    fn plugin_metadatas_patch_flips_one_plugin_enabled_flag() {
        use crate::plugin::{ExecutePluginMetaPatch, PluginMetadatas};

        let mut metas = PluginMetadatas::default();
        let original_wine = metas.wine.clone();
        let original_execute_auto_add = metas.execute.auto_add;

        metas.apply(PluginMetadatasPatch {
            execute: ExecutePluginMetaPatch {
                enabled: Some(false),
                ..Default::default()
            },
            ..Default::default()
        });

        assert!(!metas.execute.enabled);
        // Other plugins and other fields of execute are untouched.
        assert_eq!(metas.execute.auto_add, original_execute_auto_add);
        assert_eq!(format!("{:?}", metas.wine), format!("{:?}", original_wine));
    }

    #[test]
    fn device_list_patch_modifies_one_device_by_uid() {
        use crate::db::device::Device;
        let mut cfg = Config {
            devices: vec![
                Device {
                    uid: "aaa".into(),
                    name: "Device A".into(),
                    ..Default::default()
                },
                Device {
                    uid: "bbb".into(),
                    name: "Device B".into(),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        // Rename only "bbb". The list_patch op addresses by uid, so Device
        // A is not even touched on the wire.
        cfg.apply(ConfigPatch {
            devices: vec![struct_patch::list::ListPatchOp::modify(
                "bbb".to_string(),
                DevicePatch {
                    name: Some("Device B (renamed)".into()),
                    ..Default::default()
                },
            )],
            ..Default::default()
        });

        assert_eq!(cfg.devices[0].name, "Device A");
        assert_eq!(cfg.devices[1].name, "Device B (renamed)");
    }

    #[test]
    fn device_list_patch_appends_new_device() {
        use crate::db::device::Device;
        let mut cfg = Config::default();

        cfg.apply(ConfigPatch {
            devices: vec![struct_patch::list::ListPatchOp::append(Device {
                uid: "new".into(),
                name: "New Device".into(),
                ..Default::default()
            })],
            ..Default::default()
        });

        assert_eq!(cfg.devices.len(), 1);
        assert_eq!(cfg.devices[0].uid, "new");
        assert_eq!(cfg.devices[0].name, "New Device");
    }

    #[test]
    fn device_list_patch_deletes_one_device_by_uid() {
        use crate::db::device::Device;
        let mut cfg = Config {
            devices: vec![
                Device {
                    uid: "keep".into(),
                    name: "Keep".into(),
                    ..Default::default()
                },
                Device {
                    uid: "remove".into(),
                    name: "Remove".into(),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        cfg.apply(ConfigPatch {
            devices: vec![
                struct_patch::list::ListPatchOp::<Device, DevicePatch, String>::delete(
                    "remove".to_string(),
                ),
            ],
            ..Default::default()
        });

        assert_eq!(cfg.devices.len(), 1);
        assert_eq!(cfg.devices[0].uid, "keep");
    }

    #[test]
    fn device_list_patch_delete_unknown_uid_is_no_op() {
        use crate::db::device::Device;
        let mut cfg = Config {
            devices: vec![Device {
                uid: "only".into(),
                name: "Only".into(),
                ..Default::default()
            }],
            ..Default::default()
        };

        cfg.apply(ConfigPatch {
            devices: vec![
                struct_patch::list::ListPatchOp::<Device, DevicePatch, String>::delete(
                    "nonexistent".to_string(),
                ),
            ],
            ..Default::default()
        });

        assert_eq!(cfg.devices.len(), 1);
    }

    #[test]
    fn device_list_patch_mixed_ops_are_applied_in_order() {
        use crate::db::device::Device;
        let mut cfg = Config {
            devices: vec![
                Device {
                    uid: "a".into(),
                    name: "A".into(),
                    ..Default::default()
                },
                Device {
                    uid: "b".into(),
                    name: "B".into(),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        cfg.apply(ConfigPatch {
            devices: vec![
                // Modify "a"
                struct_patch::list::ListPatchOp::modify(
                    "a".to_string(),
                    DevicePatch {
                        name: Some("A-edited".into()),
                        ..Default::default()
                    },
                ),
                // Delete "b"
                struct_patch::list::ListPatchOp::<Device, DevicePatch, String>::delete(
                    "b".to_string(),
                ),
                // Append new
                struct_patch::list::ListPatchOp::append(Device {
                    uid: "c".into(),
                    name: "C".into(),
                    ..Default::default()
                }),
            ],
            ..Default::default()
        });

        assert_eq!(cfg.devices.len(), 2);
        assert_eq!(cfg.devices[0].name, "A-edited");
        assert_eq!(cfg.devices[1].uid, "c");
    }

    // ── Deep nesting: Settings sub-sub-struct patches ────────────────────

    #[test]
    fn storage_local_path_patches_through_three_levels_of_nesting() {
        use crate::db::settings::Settings;
        let mut settings = Settings::default();
        settings.storage.local.path = "/original".into();
        settings.storage.provider = crate::db::settings::StorageProvider::Local;

        // Patch only storage.local.path — this traverses Settings→StorageConfig
        // →LocalConfig, three levels of #[patch(nesting)].
        settings.apply(SettingsPatch {
            storage: StorageConfigPatch {
                local: LocalConfigPatch {
                    path: Some("/new-path".into()),
                },
                ..Default::default()
            },
            ..Default::default()
        });

        assert_eq!(settings.storage.local.path, "/new-path");
        // Provider unchanged.
        assert!(matches!(
            settings.storage.provider,
            crate::db::settings::StorageProvider::Local
        ));
    }

    #[test]
    fn appearance_time_display_patches_one_leaf_under_double_nesting() {
        use crate::db::settings::Settings;
        let mut settings = Settings::default();
        settings.appearance.theme = crate::db::settings::ThemeMode::Light;
        settings.appearance.time_display.format = crate::db::settings::TimeFormat::Relative;
        settings.appearance.time_display.language = crate::db::settings::TimeLanguage::Auto;

        // Patch only appearance.timeDisplay.format: Settings→AppearanceConfig
        // →TimeDisplayConfig, three levels deep.
        settings.apply(SettingsPatch {
            appearance: AppearanceConfigPatch {
                time_display: TimeDisplayConfigPatch {
                    format: Some(crate::db::settings::TimeFormat::Absolute),
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        });

        assert!(matches!(
            settings.appearance.time_display.format,
            crate::db::settings::TimeFormat::Absolute
        ));
        // Unchanged leaves:
        assert!(matches!(
            settings.appearance.theme,
            crate::db::settings::ThemeMode::Light
        ));
        assert!(matches!(
            settings.appearance.time_display.language,
            crate::db::settings::TimeLanguage::Auto
        ));
    }

    #[test]
    fn settings_patch_carries_auto_sync_interval_independent_of_nested_fields() {
        use crate::db::settings::Settings;
        let mut settings = Settings {
            auto_sync_interval: 300,
            ..Default::default()
        };
        let original_launch = settings.launch.clone();

        // Patch a flat Settings field (not nested).
        settings.apply(SettingsPatch {
            auto_sync_interval: Some(600),
            ..Default::default()
        });

        assert_eq!(settings.auto_sync_interval, 600);
        // Nested fields untouched (LaunchConfig is Clone + Debug but not
        // PartialEq — compare debug repr).
        assert_eq!(
            format!("{:?}", settings.launch),
            format!("{:?}", original_launch)
        );
    }
}

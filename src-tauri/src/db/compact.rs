//! Compact TOML serialization for `Config` (disk writes and sync uploads).
//!
//! The compact form omits fields whose value equals the zero value of their
//! *type*: `""`, `0`, `false`, empty collections, `None`, and an enum's
//! `#[default]` variant. Deserialization restores them via `#[serde(default)]`,
//! so the compact form is semantically identical while every write/upload
//! ships fewer bytes. The full JSON sent to the frontend (`config://updated`,
//! `get_config`) is not affected.
//!
//! Correctness rule: a field is only omissible when its struct default
//! equals the type zero, and it is pruned only when the current value equals
//! that default. Deserialization then reproduces the exact same value, so
//! compaction can never change semantics — user values that happen to be
//! zeros (`autoSyncInterval = 0`, empty `rootPath`) are kept, and meaningful
//! struct defaults (`speed = 1.5`, `maxKept = 20`, `enabled = true`) are
//! always written, keeping the file self-describing.

use std::{
    cell::RefCell,
    collections::{BTreeMap, HashMap},
};

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;

use super::{
    Config, Game,
    device::{Device, VarMap},
    settings::{
        AppearanceConfig, LaunchConfig, LocalConfig, S3Config, Settings, StorageConfig,
        StorageProvider, ThemeMode, TimeDisplayConfig, TimeFormat, TimeLanguage, WebDavConfig,
    },
};
use crate::{
    archive::{ArchiveAlgo, ArchiveConfig},
    error::Result,
    plugin::config::{
        ArchPreference, AutoUploadGameConfig, AutoUploadPluginMeta, ExecuteGameConfig,
        ExecutePhase, ExecutePluginMeta, ExitSignal, GameWrapperGameConfig, GameWrapperPluginMeta,
        LocaleEmulatorGameConfig, LocaleEmulatorPluginMeta, PluginInstance, PluginMetadatas,
        RetentionScope, SpeedupProvider, TranslatorGameConfig, TranslatorPluginMeta,
        VoiceSpeedupGameConfig, VoiceSpeedupPluginMeta, VoiceZerointerruptGameConfig,
        VoiceZerointerruptPluginMeta, WineArch, WineGameConfig, WinePluginMeta,
    },
};

// ── Type-zero values ────────────────────────────────────────────────────────

/// Type-level zero value, as opposed to a struct's `Default` (which may
/// carry meaningful values such as `speed = 1.5`). Enums have no impl here:
/// their `#[default]` variant is the zero, used inline as `Enum::default()`.
trait Zero: Sized {
    fn zero() -> Self;
}

// Struct literals (no `..Default::default()`) force every new field to
// declare its zero explicitly.

impl Zero for LocalConfig {
    fn zero() -> Self {
        Self {
            path: String::new(),
            operator: RefCell::default(),
        }
    }
}

impl Zero for WebDavConfig {
    fn zero() -> Self {
        Self {
            endpoint: String::new(),
            username: String::new(),
            password: None,
            root_path: String::new(),
            operator: RefCell::default(),
        }
    }
}

impl Zero for S3Config {
    fn zero() -> Self {
        Self {
            bucket: String::new(),
            region: String::new(),
            endpoint: None,
            access_key: String::new(),
            secret_key: String::new(),
            operator: RefCell::default(),
        }
    }
}

impl Zero for StorageConfig {
    fn zero() -> Self {
        Self {
            provider: StorageProvider::None,
            local: LocalConfig::zero(),
            webdav: WebDavConfig::zero(),
            s3: S3Config::zero(),
        }
    }
}

impl Zero for TimeDisplayConfig {
    fn zero() -> Self {
        Self {
            language: TimeLanguage::default(),
            format: TimeFormat::default(),
            absolute_format: String::new(),
        }
    }
}

impl Zero for AppearanceConfig {
    fn zero() -> Self {
        Self {
            theme: ThemeMode::default(),
            language: String::new(),
            time_display: TimeDisplayConfig::zero(),
            extract_cover_color: false,
        }
    }
}

impl Zero for LaunchConfig {
    fn zero() -> Self {
        Self {
            precision_mode: false,
            daily_stat: false,
            day_start: 0,
        }
    }
}

impl Zero for Settings {
    fn zero() -> Self {
        Self {
            storage: StorageConfig::zero(),
            archive: ArchiveConfig {
                algorithm: ArchiveAlgo::default(),
                level: 0,
                backup_before_restore: false,
            },
            appearance: AppearanceConfig::zero(),
            launch: LaunchConfig::zero(),
            auto_sync_interval: 0,
            sync_io_timeout_secs: 0,
            sync_non_io_timeout_secs: 0,
            config_daily_backup: false,
        }
    }
}

impl Zero for ExecuteGameConfig {
    fn zero() -> Self {
        Self {
            on: ExecutePhase::default(),
            cmd: String::new(),
            pass_exe_path: false,
            current_dir: String::new(),
            env: HashMap::new(),
            exit_signal: ExitSignal::default(),
        }
    }
}

impl Zero for AutoUploadGameConfig {
    fn zero() -> Self {
        Self {
            max_kept: 0,
            retention_scope: RetentionScope::default(),
        }
    }
}

impl Zero for VoiceSpeedupGameConfig {
    fn zero() -> Self {
        Self {
            speed: 0.0,
            provider: SpeedupProvider::default(),
            arch: ArchPreference::default(),
        }
    }
}

impl Zero for VoiceZerointerruptGameConfig {
    fn zero() -> Self {
        Self {
            arch: ArchPreference::default(),
        }
    }
}

impl Zero for GameWrapperGameConfig {
    fn zero() -> Self {
        Self {
            cmd: String::new(),
            current_dir: String::new(),
            env: HashMap::new(),
        }
    }
}

impl Zero for LocaleEmulatorGameConfig {
    fn zero() -> Self {
        Self { cmd: String::new() }
    }
}

impl Zero for TranslatorGameConfig {
    fn zero() -> Self {
        Self {
            cmd: String::new(),
            current_dir: String::new(),
            exit_signal: ExitSignal::default(),
        }
    }
}

impl Zero for WineGameConfig {
    fn zero() -> Self {
        Self {
            prefix: String::new(),
            arch: WineArch::default(),
            esync: false,
            fsync: false,
            dll_overrides: BTreeMap::new(),
            locale: String::new(),
            kill_wineserver_on_exit: false,
            extra_env: HashMap::new(),
        }
    }
}

impl Zero for ExecutePluginMeta {
    fn zero() -> Self {
        Self {
            enabled: false,
            auto_add: false,
            config_defaults: ExecuteGameConfig::zero(),
        }
    }
}

impl Zero for AutoUploadPluginMeta {
    fn zero() -> Self {
        Self {
            enabled: false,
            auto_add: false,
            config_defaults: AutoUploadGameConfig::zero(),
        }
    }
}

impl Zero for VoiceSpeedupPluginMeta {
    fn zero() -> Self {
        Self {
            enabled: false,
            auto_add: false,
            config_defaults: VoiceSpeedupGameConfig::zero(),
        }
    }
}

impl Zero for VoiceZerointerruptPluginMeta {
    fn zero() -> Self {
        Self {
            enabled: false,
            auto_add: false,
            config_defaults: VoiceZerointerruptGameConfig::zero(),
        }
    }
}

impl Zero for GameWrapperPluginMeta {
    fn zero() -> Self {
        Self {
            enabled: false,
            auto_add: false,
            config_defaults: GameWrapperGameConfig::zero(),
        }
    }
}

impl Zero for LocaleEmulatorPluginMeta {
    fn zero() -> Self {
        Self {
            enabled: false,
            auto_add: false,
            config_defaults: LocaleEmulatorGameConfig::zero(),
        }
    }
}

impl Zero for TranslatorPluginMeta {
    fn zero() -> Self {
        Self {
            enabled: false,
            auto_add: false,
            config_defaults: TranslatorGameConfig::zero(),
        }
    }
}

impl Zero for WinePluginMeta {
    fn zero() -> Self {
        Self {
            enabled: false,
            auto_add: false,
            config_defaults: WineGameConfig::zero(),
        }
    }
}

impl Zero for PluginMetadatas {
    fn zero() -> Self {
        Self {
            execute: ExecutePluginMeta::zero(),
            auto_upload: AutoUploadPluginMeta::zero(),
            voice_speedup: VoiceSpeedupPluginMeta::zero(),
            voice_zerointerrupt: VoiceZerointerruptPluginMeta::zero(),
            game_wrapper: GameWrapperPluginMeta::zero(),
            locale_emulator: LocaleEmulatorPluginMeta::zero(),
            translator: TranslatorPluginMeta::zero(),
            wine: WinePluginMeta::zero(),
        }
    }
}

impl Zero for Game {
    fn zero() -> Self {
        Self {
            id: 0,
            name: String::new(),
            excutable_path: None,
            save_paths: Vec::new(),
            image_url: None,
            image_sha256: None,
            added_time: DateTime::default(),
            use_time: Duration::default(),
            last_played_time: None,
            last_upload_time: None,
            daily_playtime: BTreeMap::new(),
            cover_color: None,
            steam: None,
            plugins: Vec::new(),
        }
    }
}

impl Zero for Device {
    fn zero() -> Self {
        Self {
            name: String::new(),
            uid: String::new(),
            variables: VarMap::new(),
        }
    }
}

// ── Template construction and pruning ────────────────────────────────────────

/// Template of omissible keys for `T`: the subset of `T`'s defaults that are
/// also type zeros. Keys absent from the template are never pruned.
///
/// Re-serializes `T::default()`/`T::zero()` on every call. Uncached on
/// purpose: compacting runs on the throttled save path (>= 60s apart), so
/// the per-call cost is irrelevant next to a cache's added statics.
fn template<T: Default + Zero + Serialize>() -> Result<toml::Table> {
    let defaults = toml::Value::try_from(T::default())?;
    let zeros = toml::Value::try_from(T::zero())?;
    match (defaults, zeros) {
        (toml::Value::Table(d), toml::Value::Table(z)) => Ok(intersect(&d, &z)),
        _ => Ok(toml::Table::new()),
    }
}

/// Intersect `T`'s defaults with its type zeros, keeping only omissible keys.
fn intersect(defaults: &toml::Table, zeros: &toml::Table) -> toml::Table {
    let mut out = toml::Table::new();
    for (key, default) in defaults {
        let Some(zero) = zeros.get(key) else {
            continue;
        };
        let kept = match (default, zero) {
            // Struct-shaped children: recurse. All-empty result means every
            // child default is a non-zero value -> nothing omissible here.
            (toml::Value::Table(d), toml::Value::Table(z)) if d != z => {
                let inner = intersect(d, z);
                if inner.is_empty() {
                    continue;
                }
                toml::Value::Table(inner)
            },
            // Equal (scalar, array, empty map, or a struct whose default
            // already is the type zero): omissible wholesale.
            _ if default == zero => default.clone(),
            _ => continue,
        };
        out.insert(key.clone(), kept);
    }
    out
}

/// Remove entries equal to the template; recurse into sub-tables and drop
/// tables that pruning emptied. Arrays compare atomically — element-wise
/// pruning would corrupt positional data such as `useTime = [secs, nanos]`.
fn prune(table: &mut toml::Table, tpl: &toml::Table) {
    table.retain(|key, value| {
        let Some(zero) = tpl.get(key) else {
            return true;
        };
        if value == zero {
            return false;
        }
        match (value, zero) {
            (toml::Value::Table(child), toml::Value::Table(child_tpl)) => {
                prune(child, child_tpl);
                !child.is_empty()
            },
            _ => true,
        }
    });
}

/// Prune one root section; drop its header when pruning emptied it.
fn prune_section(root: &mut toml::Table, key: &str, tpl: &toml::Table) {
    let emptied = match root.get_mut(key) {
        Some(toml::Value::Table(section)) => {
            prune(section, tpl);
            section.is_empty()
        },
        _ => return,
    };
    if emptied {
        root.remove(key);
    }
}

/// Compacted TOML text of `config`, for disk writes and sync uploads.
pub fn compact_config_string(config: &Config) -> Result<String> {
    Ok(toml::to_string(&compact_config_table(config)?)?)
}

/// Compacted TOML table of `config`.
pub fn compact_config_table(config: &Config) -> Result<toml::Table> {
    let toml::Value::Table(mut root) = toml::Value::try_from(config)? else {
        // A struct always serializes to a TOML table.
        unreachable!("config serialized to a non-table value")
    };

    prune_section(&mut root, "settings", &template::<Settings>()?);
    prune_section(
        &mut root,
        "pluginMetadatas",
        &template::<PluginMetadatas>()?,
    );

    // Root type zeros: empty `games`/`devices` arrays and an epoch
    // `lastUpdated` are restored by the container `#[serde(default)]`.
    let epoch = toml::Value::try_from(DateTime::<Utc>::default())?;
    if root.get("lastUpdated") == Some(&epoch) {
        root.remove("lastUpdated");
    }
    for key in ["games", "devices"] {
        let is_empty = root
            .get(key)
            .is_some_and(|v| v.as_array().is_some_and(Vec::is_empty));
        if is_empty {
            root.remove(key);
        }
    }

    // Array-of-tables entries are pruned element-wise, walking the typed
    // source in parallel (serde preserves element order).
    let game_tpl = template::<Game>()?;
    if let Some(toml::Value::Array(games)) = root.get_mut("games") {
        for (value, typed) in games.iter_mut().zip(&config.games) {
            let toml::Value::Table(game) = value else {
                continue;
            };
            prune(game, &game_tpl);
            prune_plugin_instances(game, typed)?;
        }
    }

    let device_tpl = template::<Device>()?;
    if let Some(toml::Value::Array(devices)) = root.get_mut("devices") {
        for value in devices.iter_mut() {
            let toml::Value::Table(device) = value else {
                continue;
            };
            prune(device, &device_tpl);
        }
    }

    Ok(root)
}

/// Prune each plugin instance's `config` with the template of its variant;
/// the `pluginId` tag is never pruned. An instance whose config is fully
/// default loses the whole `config` key (restored by field-level
/// `#[serde(default)]`).
fn prune_plugin_instances(game: &mut toml::Table, typed: &Game) -> Result<()> {
    let Some(toml::Value::Array(instances)) = game.get_mut("plugins") else {
        return Ok(());
    };
    for (value, typed_instance) in instances.iter_mut().zip(&typed.plugins) {
        let toml::Value::Table(instance) = value else {
            continue;
        };
        let tpl = instance_config_template(typed_instance)?;
        let emptied = match instance.get_mut("config") {
            Some(toml::Value::Table(cfg)) => {
                prune(cfg, &tpl);
                cfg.is_empty()
            },
            _ => continue,
        };
        if emptied {
            instance.remove("config");
        }
    }
    Ok(())
}

/// Config template matching the instance's variant — a typed match, so a new
/// `PluginInstance` variant forces an arm here.
fn instance_config_template(instance: &PluginInstance) -> Result<toml::Table> {
    match instance {
        PluginInstance::Execute { .. } => template::<ExecuteGameConfig>(),
        PluginInstance::AutoUpload { .. } => template::<AutoUploadGameConfig>(),
        PluginInstance::VoiceSpeedup { .. } => template::<VoiceSpeedupGameConfig>(),
        PluginInstance::VoiceZerointerrupt { .. } => template::<VoiceZerointerruptGameConfig>(),
        PluginInstance::GameWrapper { .. } => template::<GameWrapperGameConfig>(),
        PluginInstance::LocaleEmulator { .. } => template::<LocaleEmulatorGameConfig>(),
        PluginInstance::Translator { .. } => template::<TranslatorGameConfig>(),
        PluginInstance::Wine { .. } => template::<WineGameConfig>(),
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::*;

    /// Full (non-compact) TOML of a config, for lossless-comparison.
    fn full_toml(config: &Config) -> String {
        toml::to_string(config).expect("full serialization must not fail")
    }

    /// Compact, reload, and assert the reloaded config serializes (fully)
    /// identically to the original — compaction must be lossless. Returns
    /// the compact text for further assertions.
    fn assert_lossless(config: &Config) -> String {
        let compact = compact_config_string(config).unwrap();
        let reloaded: Config = toml::from_str(&compact).unwrap();
        assert_eq!(full_toml(&reloaded), full_toml(config));
        compact
    }

    #[test]
    fn default_config_prunes_type_zero_noise() {
        let compact = assert_lossless(&Config::default());
        // Type-zero defaults are gone everywhere:
        assert!(!compact.contains("provider"), "got: {compact}");
        assert!(!compact.contains("autoAdd"), "got: {compact}");
        assert!(!compact.contains("dayStart"), "got: {compact}");
        assert!(
            !compact.contains("[settings.storage.local]"),
            "got: {compact}"
        );
        assert!(
            !compact.contains("[pluginMetadatas.execute.configDefaults]"),
            "got: {compact}"
        );
        assert!(
            !compact.contains("[pluginMetadatas.wine.configDefaults]"),
            "got: {compact}"
        );
        assert!(!compact.contains("games = []"), "got: {compact}");
        assert!(!compact.contains("devices = []"), "got: {compact}");
        assert!(!compact.contains("lastUpdated"), "got: {compact}");
        // Meaningful defaults stay (deliberately not compacted away):
        assert!(
            compact.contains("autoSyncInterval = 1200"),
            "got: {compact}"
        );
        assert!(
            compact.contains("rootPath = \"/GalgameManager\""),
            "got: {compact}"
        );
        assert!(compact.contains("maxKept = 20"), "got: {compact}");
        assert!(compact.contains("enabled = true"), "got: {compact}");
    }

    #[test]
    fn customized_config_prunes_default_noise_keeps_meaningful_values() {
        let mut config = Config {
            last_updated: Utc::now(),
            ..Default::default()
        };
        // User values that are type zeros but NOT the struct default must be
        // kept: pruning them would silently restore the default on load.
        config.settings.auto_sync_interval = 0;
        config.settings.storage.webdav.root_path = String::new();
        config.settings.appearance.language = "en-US".into();
        config.settings.appearance.theme = ThemeMode::Dark;

        let mut game = Game {
            id: 1,
            name: "KANDE".into(),
            excutable_path: Some("C:/g/KANADE.exe".into()),
            save_paths: vec!["C:/save".into()],
            use_time: Duration::seconds(27),
            ..Default::default()
        };
        game.plugins = vec![
            PluginInstance::VoiceSpeedup {
                config: VoiceSpeedupGameConfig::default(),
            },
            PluginInstance::Wine {
                config: WineGameConfig {
                    prefix: "/prefix".into(),
                    ..Default::default()
                },
            },
            PluginInstance::GameWrapper {
                config: GameWrapperGameConfig::default(),
            },
        ];
        config.games = vec![game];
        config.devices = vec![Device {
            uid: "uid".into(),
            name: "PC".into(),
            ..Default::default()
        }];

        let compact = assert_lossless(&config);

        // Type-zero defaults pruned:
        assert!(!compact.contains("autoAdd"), "got: {compact}");
        assert!(!compact.contains("provider"), "got: {compact}");
        assert!(!compact.contains("arch ="), "got: {compact}");
        assert!(!compact.contains("passExePath"), "got: {compact}");
        assert!(
            !compact.contains("[settings.storage.local]"),
            "got: {compact}"
        );
        // Execute's configDefaults are all type zeros: gone wholesale.
        assert!(
            !compact.contains("[pluginMetadatas.execute.configDefaults]"),
            "got: {compact}"
        );
        // GameWrapper instance config fully default: whole `config` key gone.
        assert_eq!(
            compact.matches("[games.plugins.config]").count(),
            2,
            "got: {compact}"
        );

        // Meaningful defaults kept (file stays self-describing):
        assert!(compact.contains("enabled = true"), "got: {compact}");
        assert!(compact.contains("speed = 1.5"), "got: {compact}");
        assert!(compact.contains("maxKept = 20"), "got: {compact}");
        assert!(
            compact.contains("bucket = \"GalgameManager\""),
            "got: {compact}"
        );
        assert!(
            compact.contains("exitSignal = \"sigterm\""),
            "got: {compact}"
        );
        // Zero-but-non-default user values kept:
        assert!(compact.contains("autoSyncInterval = 0"), "got: {compact}");
        assert!(compact.contains("rootPath = \"\""), "got: {compact}");
        // User values kept:
        assert!(compact.contains("theme = \"dark\""), "got: {compact}");
        assert!(compact.contains("prefix = \"/prefix\""), "got: {compact}");
        assert!(compact.contains("savePaths"), "got: {compact}");
        assert!(compact.contains("useTime = [27, 0]"), "got: {compact}");
    }

    #[test]
    fn fresh_game_prunes_save_paths_and_zero_use_time() {
        let config = Config {
            games: vec![Game {
                id: 1,
                name: "fresh".into(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let compact = assert_lossless(&config);
        assert!(!compact.contains("savePaths"), "got: {compact}");
        assert!(!compact.contains("useTime"), "got: {compact}");
        assert!(compact.contains("name = \"fresh\""), "got: {compact}");
    }
}

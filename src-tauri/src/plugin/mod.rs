mod auto_upload;
pub mod config;
mod execute;
mod game_wrapper;
mod locale_emulator;
mod transaction;
mod translator;
mod voice_speedup;
mod voice_zerointerrupt;

use std::{collections::HashMap, path::Path, sync::LazyLock as Lazy};

// Re-export all public config types for downstream convenience.
pub use config::{
    ArchPreference, AutoUploadPluginMeta, ExecuteGameConfig, ExecutePhase, ExecutePluginMeta,
    ExitSignal, GameWrapperGameConfig, GameWrapperPluginMeta, LocaleEmulatorGameConfig,
    LocaleEmulatorPluginMeta, PluginConfig, PluginInstance, PluginMetadatas, SpeedupProvider,
    TranslatorGameConfig, TranslatorPluginMeta, VoiceSpeedupGameConfig, VoiceSpeedupPluginMeta,
    VoiceZerointerruptGameConfig, VoiceZerointerruptPluginMeta,
};
use serde::Deserialize;
use tauri::AppHandle;
pub use transaction::{CleanupPhase, Transaction};

use crate::{
    db::device::ResolveVar,
    error::{Error, Result},
    exec::StartCtx,
};

// region: Plugin handler trait and context

/// Context passed to plugin lifecycle hooks.
pub struct PluginContext {
    pub app: tauri::AppHandle,
    pub game_id: u32,
    /// Per-game config for this plugin instance
    pub config: PluginConfig,
    pub transaction: Transaction,
}

/// Trait for plugin lifecycle handlers.
///
/// Each plugin type implements this trait to define its behavior at various
/// game lifecycle stages. Default implementations are no-ops.
#[async_trait::async_trait]
pub trait PluginHandler: Send + Sync + 'static {
    /// Called before the game process is launched.
    async fn before_game_start(&self, _ctx: PluginContext) -> Result<()> {
        Ok(())
    }

    /// Called after the game process has been spawned.
    async fn after_game_start(&self, _ctx: PluginContext) -> Result<()> {
        Ok(())
    }

    /// Called after the game process has exited.
    async fn after_game_exit(&self, _ctx: PluginContext) -> Result<()> {
        Ok(())
    }

    /// Called before a save archive is uploaded to remote storage.
    async fn before_save_upload(&self, _ctx: PluginContext, _archive_filename: &str) -> Result<()> {
        Ok(())
    }

    /// Called after a save archive has been uploaded to remote storage.
    async fn after_save_upload(&self, _ctx: PluginContext, _archive_filename: &str) -> Result<()> {
        Ok(())
    }

    /// Return a `StartCtx` to override how the game is launched.
    ///
    /// When a plugin returns `Some(StartCtx)`, the game process will be
    /// spawned using that context instead of the default executable path.
    /// Only the first override found in the plugin list is used.
    ///
    /// The default implementation returns `Ok(None)` (no override).
    fn get_launch_override(&self, _ctx: &PluginContext) -> Result<Option<StartCtx>> {
        Ok(None)
    }
}

// endregion

// region: Shared command resolution utility

/// Resolve variables in a command configuration, inserting the game
/// executable path as the `{}` placeholder.
///
/// This is the shared logic used by both the `execute` and `game_wrapper`
/// plugins (and their wrappers) to build a resolved `StartCtx`.
pub(crate) fn resolve_cmd_config(
    game_id: u32,
    cmd: &str,
    current_dir: &str,
    env: &HashMap<String, String>,
    require_placeholder: bool,
) -> Result<StartCtx> {
    let (mut varmap, exe) = {
        let lock = crate::db::CONFIG.lock();
        let varmap = lock.varmap().clone();
        let exe = lock.get_game_by_id(game_id)?.excutable_path.clone();
        (varmap, exe)
    };
    let resolved_exe = varmap.resolve_var(&exe.ok_or(Error::Launch)?)?;
    let game_dir = Path::new(&resolved_exe)
        .parent()
        .map(|p| p.to_string_lossy().to_string());
    varmap.insert("".to_string(), resolved_exe);

    if require_placeholder && !cmd.contains("{}") {
        return Err(Error::InvalidCommand(
            "Command must contain '{}' placeholder when passExePath is enabled".into(),
        ));
    }

    let resolved_cmd = varmap.resolve_var(cmd)?;

    let resolved_current_dir = if current_dir.is_empty() {
        // Default to the directory containing the game executable
        game_dir
    } else {
        Some(varmap.resolve_var(current_dir)?)
    };

    let resolved_env = if env.is_empty() {
        None
    } else {
        let mut resolved_env_map = HashMap::new();
        for (k, v) in env {
            resolved_env_map.insert(k.clone(), varmap.resolve_var(v)?);
        }
        Some(resolved_env_map)
    };

    Ok(StartCtx {
        cmd: resolved_cmd,
        current_dir: resolved_current_dir,
        env: resolved_env,
    })
}

// endregion

// region: Plugin registry

use indexmap::IndexMap;

/// Registry that holds all registered plugin handlers.
///
/// ## Adding a new plugin
///
/// Add one line to the `new()` constructor:
/// ```ignore
/// register!("myPlugin", my_plugin::MyPluginHandler::new());
/// ```
pub struct PluginRegistry {
    handlers: IndexMap<&'static str, Box<dyn PluginHandler>>,
}

impl PluginRegistry {
    fn new() -> Self {
        let mut handlers = IndexMap::new();

        macro_rules! register {
            ($id:expr, $handler:expr) => {
                let p = $handler;
                handlers.insert($id, Box::new(p) as Box<dyn PluginHandler>);
            };
        }

        // ── Register all plugins here (one line per plugin) ──
        register!(execute::PLUGIN_ID, execute::ExecutePlugin::new());
        register!(auto_upload::PLUGIN_ID, auto_upload::AutoUploadPlugin::new());
        register!(
            game_wrapper::PLUGIN_ID,
            game_wrapper::GameWrapperPlugin::new()
        );
        register!(
            locale_emulator::PLUGIN_ID,
            locale_emulator::LocaleEmulatorPlugin::new()
        );
        register!(translator::PLUGIN_ID, translator::TranslatorPlugin::new());
        #[cfg(windows)]
        register!(
            voice_speedup::PLUGIN_ID,
            voice_speedup::VoiceSpeedupPlugin::new()
        );
        #[cfg(windows)]
        register!(
            voice_zerointerrupt::PLUGIN_ID,
            voice_zerointerrupt::VoiceZerointerruptPlugin::new()
        );

        Self { handlers }
    }

    /// Get a plugin handler by ID.
    #[inline]
    pub fn get(&self, id: &str) -> Option<&dyn PluginHandler> {
        self.handlers.get(id).map(|h| h.as_ref())
    }

    /// Get all registered plugin IDs.
    pub fn ids(&self) -> Vec<&str> {
        self.handlers.keys().copied().collect()
    }
}

/// Global plugin registry, initialized once at startup.
pub static PLUGIN_REGISTRY: Lazy<PluginRegistry> = Lazy::new(PluginRegistry::new);

// endregion

// region: Hook dispatch helpers

/// Build a `PluginContext` for a specific plugin instance.
///
/// When adding a new plugin, add one match arm here.
pub(crate) fn make_plugin_context(
    instance: &PluginInstance,
    app: AppHandle,
    game_id: u32,
    transaction: Transaction,
) -> Option<PluginContext> {
    _ = PLUGIN_REGISTRY.get(instance.handler_key())?; // check if plugin is registered
    Some(match instance {
        PluginInstance::Execute { config } => PluginContext {
            app,
            game_id,
            config: PluginConfig::Execute(config.clone()),
            transaction,
        },
        PluginInstance::AutoUpload => PluginContext {
            app,
            game_id,
            config: PluginConfig::AutoUpload,
            transaction,
        },
        PluginInstance::VoiceSpeedup { config } => PluginContext {
            app,
            game_id,
            config: PluginConfig::VoiceSpeedup(config.clone()),
            transaction,
        },
        PluginInstance::VoiceZerointerrupt { config } => PluginContext {
            app,
            game_id,
            config: PluginConfig::VoiceZerointerrupt(config.clone()),
            transaction,
        },
        PluginInstance::GameWrapper { config } => PluginContext {
            app,
            game_id,
            config: PluginConfig::GameWrapper(config.clone()),
            transaction,
        },
        PluginInstance::LocaleEmulator { config } => PluginContext {
            app,
            game_id,
            config: PluginConfig::LocaleEmulator(config.clone()),
            transaction,
        },
        PluginInstance::Translator { config } => PluginContext {
            app,
            game_id,
            config: PluginConfig::Translator(config.clone()),
            transaction,
        },
    })
}

/// Dispatch `before_save_upload` hooks for all enabled plugins of a game.
pub async fn dispatch_before_save_upload(
    app: &AppHandle,
    game_id: u32,
    archive_filename: &str,
    transaction: Transaction,
) -> Result<()> {
    let (plugins, metas) = {
        let lock = crate::db::CONFIG.lock();
        let game = lock.get_game_by_id(game_id)?;
        (game.plugins.clone(), lock.plugin_metadatas.clone())
    };

    for instance in &plugins {
        if !metas.is_enabled(instance) {
            continue;
        }
        if let Some(handler) = PLUGIN_REGISTRY.get(instance.handler_key())
            && let Some(ctx) =
                make_plugin_context(instance, app.clone(), game_id, transaction.clone())
        {
            handler.before_save_upload(ctx, archive_filename).await?;
        }
    }
    Ok(())
}

/// Dispatch `after_save_upload` hooks for all enabled plugins of a game.
///
/// Errors from individual hooks are logged but do not abort iteration.
pub async fn dispatch_after_save_upload(
    app: &AppHandle,
    game_id: u32,
    archive_filename: &str,
    transaction: Transaction,
) {
    let (plugins, metas) = {
        let lock = crate::db::CONFIG.lock();
        let game = match lock.get_game_by_id(game_id) {
            Ok(g) => g,
            Err(e) => {
                log::error!("dispatch_after_save_upload: {e}");
                return;
            }
        };
        (game.plugins.clone(), lock.plugin_metadatas.clone())
    };

    for instance in &plugins {
        if !metas.is_enabled(instance) {
            continue;
        }
        if let Some(handler) = PLUGIN_REGISTRY.get(instance.handler_key())
            && let Some(ctx) =
                make_plugin_context(instance, app.clone(), game_id, transaction.clone())
            && let Err(e) = handler.after_save_upload(ctx, archive_filename).await
        {
            log::error!(
                "after_save_upload hook failed for plugin '{}': {e}",
                instance.handler_key()
            );
        }
    }
}

// endregion

// region: Backward-compatible deserialization helpers

/// Custom deserializer that gracefully handles old `PluginMetadatas` formats
/// by falling back to defaults.
pub fn deserialize_metadatas_fallback<'de, D>(
    deserializer: D,
) -> std::result::Result<PluginMetadatas, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let toml_val = toml::Value::deserialize(deserializer)?;
    match toml_val.try_into() {
        Ok(v) => Ok(v),
        Err(_) => Ok(PluginMetadatas::default()),
    }
}

/// Custom deserializer that gracefully handles the old `PluginConfig` enum
/// format by falling back to an empty vec.
pub fn deserialize_plugins_fallback<'de, D>(
    deserializer: D,
) -> std::result::Result<Vec<PluginInstance>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let toml_val = toml::Value::deserialize(deserializer)?;
    match toml_val.try_into() {
        Ok(v) => Ok(v),
        Err(_) => Ok(vec![]),
    }
}

// endregion

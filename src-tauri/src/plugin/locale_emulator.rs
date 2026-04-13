//! LocaleEmulator plugin: a simplified wrapper around the GameWrapper plugin.
//!
//! This plugin provides a streamlined interface for Locale Emulator
//! integration. It delegates all execution logic to the GameWrapper plugin by
//! converting its own config to a `GameWrapperGameConfig` at runtime.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{PLUGIN_REGISTRY, PluginConfig, PluginContext, config::GameWrapperGameConfig};
use crate::{error::Result, exec::StartCtx};

/// Plugin identifier used in the registry and config.
pub const PLUGIN_ID: &str = "localeEmulator";

// ── Config types ─────────────────────────────────────────────────────────────

/// Per-game config for the LocaleEmulator plugin.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct LocaleEmulatorGameConfig {
    /// The command to launch the game through Locale Emulator.
    /// Must contain `{}` which will be replaced with the game exe path.
    /// Default: 'your_path/LEProc.exe "{}"'
    pub cmd: String,
}

impl Default for LocaleEmulatorGameConfig {
    fn default() -> Self {
        Self {
            cmd: r#"your_path/LEProc.exe "{}""#.to_string(),
        }
    }
}

/// Global metadata for the LocaleEmulator plugin (stored in `PluginMetadatas`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct LocaleEmulatorPluginMeta {
    pub enabled: bool,
    pub auto_add: bool,
    pub config_defaults: LocaleEmulatorGameConfig,
}

impl Default for LocaleEmulatorPluginMeta {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add: false,
            config_defaults: LocaleEmulatorGameConfig::default(),
        }
    }
}

// ── Config conversion ────────────────────────────────────────────────────────

impl LocaleEmulatorGameConfig {
    /// Convert to a `GameWrapperGameConfig` for delegation.
    fn to_game_wrapper_config(&self) -> GameWrapperGameConfig {
        GameWrapperGameConfig {
            cmd: self.cmd.clone(),
            current_dir: String::new(),
            env: std::collections::HashMap::new(),
        }
    }
}

// ── Handler ──────────────────────────────────────────────────────────────────

pub struct LocaleEmulatorPlugin;

impl LocaleEmulatorPlugin {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl super::PluginHandler for LocaleEmulatorPlugin {
    /// Delegate to the GameWrapper handler for launch override.
    fn get_launch_override(&self, ctx: &PluginContext) -> Result<Option<StartCtx>> {
        let PluginConfig::LocaleEmulator(ref config) = ctx.config else {
            return Ok(None);
        };

        if config.cmd.is_empty() {
            return Ok(None);
        }

        let inner_config = config.to_game_wrapper_config();
        let inner_ctx = PluginContext {
            app: ctx.app.clone(),
            game_id: ctx.game_id,
            config: PluginConfig::GameWrapper(inner_config),
        };

        if let Some(handler) = PLUGIN_REGISTRY.get(super::game_wrapper::PLUGIN_ID) {
            handler.get_launch_override(&inner_ctx)
        } else {
            Ok(None)
        }
    }
}

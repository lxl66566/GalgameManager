//! Translator plugin: a simplified wrapper around the Execute plugin.
//!
//! This plugin provides a streamlined interface for running a translation tool
//! alongside the game. It delegates all execution logic to the Execute plugin
//! by converting its own config to an `ExecuteGameConfig` at runtime.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{
    PLUGIN_REGISTRY, PluginConfig, PluginContext,
    config::{ExecuteGameConfig, ExecutePhase, ExitSignal},
};
use crate::{error::Result, plugin::Transaction};

/// Plugin identifier used in the registry and config.
pub const PLUGIN_ID: &str = "translator";

// ── Config types ──

/// Per-game config for the Translator plugin.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct TranslatorGameConfig {
    /// The command to launch the translator tool.
    pub cmd: String,
    /// Working directory. If empty, defaults to the directory of the program
    /// (first argument of cmd).
    pub current_dir: String,
    /// Signal to send to the translator process when the game exits.
    /// Defaults to SIGTERM (graceful shutdown).
    pub exit_signal: ExitSignal,
}

impl Default for TranslatorGameConfig {
    fn default() -> Self {
        Self {
            cmd: String::new(),
            current_dir: String::new(),
            exit_signal: ExitSignal::Sigterm,
        }
    }
}

/// Global metadata for the Translator plugin (stored in `PluginMetadatas`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct TranslatorPluginMeta {
    pub enabled: bool,
    pub auto_add: bool,
    pub config_defaults: TranslatorGameConfig,
}

impl Default for TranslatorPluginMeta {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add: false,
            config_defaults: TranslatorGameConfig::default(),
        }
    }
}

// ── Config conversion ────────────────────────────────────────────────────────

impl TranslatorGameConfig {
    /// Convert to an `ExecuteGameConfig` for delegation.
    fn to_execute_config(&self) -> ExecuteGameConfig {
        ExecuteGameConfig {
            on: ExecutePhase::BeforeGameStart,
            cmd: self.cmd.clone(),
            pass_exe_path: false,
            current_dir: self.current_dir.clone(),
            env: std::collections::HashMap::new(),
            exit_signal: self.exit_signal,
        }
    }
}

// ── Handler ───────

pub struct TranslatorPlugin;

impl TranslatorPlugin {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl super::PluginHandler for TranslatorPlugin {
    async fn before_game_start(&self, ctx: PluginContext) -> Result<()> {
        let PluginConfig::Translator(ref config) = ctx.config else {
            return Ok(());
        };

        let inner_config = config.to_execute_config();
        let inner_ctx = PluginContext {
            app: ctx.app,
            game_id: ctx.game_id,
            config: PluginConfig::Execute(inner_config),
            transaction: Transaction::new(),
        };

        if let Some(handler) = PLUGIN_REGISTRY.get(super::execute::PLUGIN_ID) {
            handler.before_game_start(inner_ctx).await?;
        }
        Ok(())
    }

    async fn after_game_start(&self, ctx: PluginContext) -> Result<()> {
        let PluginConfig::Translator(ref config) = ctx.config else {
            return Ok(());
        };

        let inner_config = config.to_execute_config();
        let inner_ctx = PluginContext {
            app: ctx.app,
            game_id: ctx.game_id,
            config: PluginConfig::Execute(inner_config),
            transaction: Transaction::new(),
        };

        if let Some(handler) = PLUGIN_REGISTRY.get(super::execute::PLUGIN_ID) {
            handler.after_game_start(inner_ctx).await?;
        }
        Ok(())
    }

    async fn after_game_exit(&self, ctx: PluginContext) -> Result<()> {
        let PluginConfig::Translator(ref config) = ctx.config else {
            return Ok(());
        };

        let inner_config = config.to_execute_config();
        let inner_ctx = PluginContext {
            app: ctx.app,
            game_id: ctx.game_id,
            config: PluginConfig::Execute(inner_config),
            transaction: Transaction::new(),
        };

        if let Some(handler) = PLUGIN_REGISTRY.get(super::execute::PLUGIN_ID) {
            handler.after_game_exit(inner_ctx).await?;
        }
        Ok(())
    }
}

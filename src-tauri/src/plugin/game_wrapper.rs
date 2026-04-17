//! GameWrapper plugin: replace the game spawn command with a custom one.
//!
//! Unlike the `execute` plugin which spawns a **separate** process, this
//! plugin replaces how the game process itself is launched. The `{}` in the
//! command is always replaced with the resolved game executable path.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{PluginConfig, PluginContext, resolve_cmd_config};
use crate::{error::Result, exec::StartCtx};

/// Plugin identifier used in the registry and config.
pub const PLUGIN_ID: &str = "gameWrapper";

// ── Config types ──

/// Per-game config for the GameWrapper plugin.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct GameWrapperGameConfig {
    /// The command to launch instead of the game exe directly.
    /// Must contain `{}` which will be replaced with the game exe path.
    pub cmd: String,
    pub current_dir: String,
    pub env: HashMap<String, String>,
}

/// Global metadata for the GameWrapper plugin (stored in `PluginMetadatas`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct GameWrapperPluginMeta {
    pub enabled: bool,
    pub auto_add: bool,
    pub config_defaults: GameWrapperGameConfig,
}

impl Default for GameWrapperPluginMeta {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add: false,
            config_defaults: GameWrapperGameConfig::default(),
        }
    }
}

// ── Handler ───────

pub struct GameWrapperPlugin;

impl GameWrapperPlugin {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl super::PluginHandler for GameWrapperPlugin {
    /// Provide a launch override that replaces the default game spawn.
    fn get_launch_override(&self, ctx: &PluginContext) -> Result<Option<StartCtx>> {
        let PluginConfig::GameWrapper(ref config) = ctx.config else {
            return Ok(None);
        };

        if config.cmd.is_empty() {
            return Ok(None);
        }

        // `{}` is always required for game_wrapper
        let start_ctx = resolve_cmd_config(
            ctx.game_id,
            &config.cmd,
            &config.current_dir,
            &config.env,
            true, // require `{}` placeholder
        )?;

        log::info!(
            "GameWrapperPlugin: overriding launch with '{}'",
            start_ctx.cmd,
        );
        Ok(Some(start_ctx))
    }
}

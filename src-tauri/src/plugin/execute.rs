//! Execute plugin: run external CLI commands at game lifecycle events.
//!
//! This module is self-contained — it defines all config types **and** the
//! handler in one place. To register a new plugin, follow this pattern and
//! add the corresponding entries in `config.rs` and `mod.rs`.

use std::{collections::HashMap, process::Child, sync::LazyLock as Lazy};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::Result;

/// Plugin identifier used in the registry and config.
pub const PLUGIN_ID: &str = "execute";

// ── Config types ──

/// When the execute command should fire.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ExecutePhase {
    #[default]
    BeforeGameStart,
    AfterGameStart,
    GameExit,
}

/// Signal to send to the spawned process when the game exits.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum ExitSignal {
    #[default]
    None,
    Sigterm,
    Sigkill,
}

/// Per-game config for the Execute plugin.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct ExecuteGameConfig {
    pub on: ExecutePhase,
    pub cmd: String,
    /// When `true`, the cmd must contain a `{}` placeholder which will be
    /// replaced with the resolved game executable path.
    pub pass_exe_path: bool,
    pub current_dir: String,
    pub env: HashMap<String, String>,
    /// Signal to send to the spawned process when the game exits.
    pub exit_signal: ExitSignal,
}

/// Global metadata for the Execute plugin (stored in `PluginMetadatas`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct ExecutePluginMeta {
    pub enabled: bool,
    pub auto_add: bool,
    /// Default per-game config applied when the plugin is added to a new game.
    pub config_defaults: ExecuteGameConfig,
}

impl Default for ExecutePluginMeta {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add: false,
            config_defaults: ExecuteGameConfig::default(),
        }
    }
}

// ── Process tracking for exit signals ────────────────────────────────────────

/// Tracks spawned `Child` handles per game, paired with the exit signal
/// config. The first `after_game_exit` call removes the entry atomically, so
/// cleanup happens exactly once per game session.
///
/// We hold the `Child` itself instead of a bare PID: game sessions run for
/// hours, and a tracked tool that exits early would have its PID recycled by
/// the OS, making the game-exit kill hit an unrelated process. Holding the
/// handle keeps the PID reserved on both platforms (Windows: open process
/// handle; Unix: unreaped zombie), so a late signal can never miss.
static TRACKED_PROCESSES: Lazy<DashMap<u32, Vec<(Child, ExitSignal)>>> = Lazy::new(DashMap::new);

/// Send the configured exit signal to a tracked child via its owned handle.
#[cfg(windows)]
fn send_signal(child: &mut Child, signal: ExitSignal) -> Result<()> {
    match signal {
        ExitSignal::None => Ok(()),
        ExitSignal::Sigterm | ExitSignal::Sigkill => {
            if signal == ExitSignal::Sigterm {
                log::warn!(
                    "SIGTERM is not natively supported on Windows, falling back to \
                     TerminateProcess"
                );
            }
            // kill() goes through the child's own handle — no OpenProcess by
            // PID, so no PID-reuse race.
            child.kill().map_err(|_| crate::error::Error::Launch)?;
            log::info!("Terminated tracked process (pid={})", child.id());
            Ok(())
        },
    }
}

/// Send the configured exit signal to a tracked child.
#[cfg(not(windows))]
fn send_signal(child: &mut Child, signal: ExitSignal) -> Result<()> {
    match signal {
        ExitSignal::None => Ok(()),
        ExitSignal::Sigterm | ExitSignal::Sigkill => {
            let sig_name = match signal {
                ExitSignal::Sigterm => "TERM",
                ExitSignal::Sigkill => "KILL",
                ExitSignal::None => unreachable!(),
            };
            // The PID is still reserved while we hold the un-reaped Child;
            // if the tool already exited this is a harmless no-op on a zombie.
            std::process::Command::new("kill")
                .args(["-s", sig_name, &child.id().to_string()])
                .status()?;
            log::info!("Sent SIG{sig_name} to tracked process {}", child.id());
            Ok(())
        },
    }
}

// ── Handler ───────

pub struct ExecutePlugin;

impl ExecutePlugin {
    pub fn new() -> Self {
        Self
    }

    fn try_execute(ctx: &super::PluginContext, phase: ExecutePhase) -> Result<()> {
        let super::PluginConfig::Execute(config) = &*ctx.config else {
            return Ok(());
        };

        if config.on != phase || config.cmd.is_empty() {
            return Ok(());
        }

        let start_ctx = super::resolve_cmd_config(
            &ctx.launch.exe_path,
            &ctx.launch.current_dir,
            &config.cmd,
            &config.current_dir,
            &config.env,
            config.pass_exe_path,
        )
        .map_err(|e| crate::error::Error::PluginCommand {
            plugin: PLUGIN_ID,
            source: Box::new(e),
        })?;

        log::info!(
            "ExecutePlugin: phase={phase:?}, game_id={}, {start_ctx}",
            ctx.launch.game_id,
        );

        let child = start_ctx.spawn().map_err(|e| {
            log::error!("ExecutePlugin: failed to spawn {start_ctx}: {e}");
            crate::error::Error::PluginCommand {
                plugin: PLUGIN_ID,
                source: Box::new(e),
            }
        })?;

        if phase != ExecutePhase::GameExit && config.exit_signal != ExitSignal::None {
            TRACKED_PROCESSES
                .entry(ctx.launch.game_id)
                .or_default()
                .push((child, config.exit_signal));
        }

        Ok(())
    }
}

#[async_trait::async_trait]
impl super::PluginHandler for ExecutePlugin {
    async fn before_game_start(&self, ctx: super::PluginContext) -> Result<()> {
        Self::try_execute(&ctx, ExecutePhase::BeforeGameStart)
    }

    async fn after_game_start(&self, ctx: super::PluginContext) -> Result<()> {
        Self::try_execute(&ctx, ExecutePhase::AfterGameStart)
    }

    async fn after_game_exit(&self, ctx: super::PluginContext) -> Result<()> {
        if let Some((_, mut processes)) = TRACKED_PROCESSES.remove(&ctx.launch.game_id) {
            for (child, signal) in &mut processes {
                if let Err(e) = send_signal(child, *signal) {
                    log::warn!("Failed to send {signal:?} to tracked process: {e}");
                }
            }
        }

        Self::try_execute(&ctx, ExecutePhase::GameExit)
    }
}

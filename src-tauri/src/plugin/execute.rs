//! Execute plugin: run external CLI commands at game lifecycle events.
//!
//! This module is self-contained — it defines all config types **and** the
//! handler in one place. To register a new plugin, follow this pattern and
//! add the corresponding entries in `config.rs` and `mod.rs`.

use std::{collections::HashMap, sync::LazyLock as Lazy};

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

/// Tracks PIDs spawned by execute plugins per game, paired with the exit
/// signal config. The first `after_game_exit` call removes the entry
/// atomically, so cleanup happens exactly once per game session.
static TRACKED_PROCESSES: Lazy<DashMap<u32, Vec<(u32, ExitSignal)>>> = Lazy::new(DashMap::new);

/// Send a signal to a process by PID.
#[cfg(windows)]
fn send_signal(pid: u32, signal: ExitSignal) -> Result<()> {
    match signal {
        ExitSignal::None => Ok(()),
        ExitSignal::Sigterm | ExitSignal::Sigkill => {
            if signal == ExitSignal::Sigterm {
                log::warn!(
                    "SIGTERM is not natively supported on Windows, \
                     falling back to TerminateProcess for pid {pid}"
                );
            }
            use windows::Win32::{
                Foundation::CloseHandle,
                System::Threading::{OpenProcess, PROCESS_TERMINATE, TerminateProcess},
            };
            let handle = unsafe { OpenProcess(PROCESS_TERMINATE, false, pid) }
                .map_err(|_| crate::error::Error::Launch)?;
            let res = unsafe { TerminateProcess(handle, 1) };
            unsafe {
                let _ = CloseHandle(handle);
            }
            res.map_err(|_| crate::error::Error::Launch)?;
            log::info!("Terminated process {pid}");
            Ok(())
        }
    }
}

/// Send a signal to a process by PID.
#[cfg(not(windows))]
fn send_signal(pid: u32, signal: ExitSignal) -> Result<()> {
    match signal {
        ExitSignal::None => Ok(()),
        ExitSignal::Sigterm | ExitSignal::Sigkill => {
            let sig_name = match signal {
                ExitSignal::Sigterm => "TERM",
                ExitSignal::Sigkill => "KILL",
                ExitSignal::None => unreachable!(),
            };
            std::process::Command::new("kill")
                .args(["-s", sig_name, &pid.to_string()])
                .status()?;
            log::info!("Sent SIG{sig_name} to process {pid}");
            Ok(())
        }
    }
}

// ── Handler ───────

pub struct ExecutePlugin;

impl ExecutePlugin {
    pub fn new() -> Self {
        Self
    }

    fn try_execute(&self, ctx: &super::PluginContext, phase: ExecutePhase) -> Result<()> {
        let super::PluginConfig::Execute(ref config) = ctx.config else {
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
            let pid = child.id();
            TRACKED_PROCESSES
                .entry(ctx.launch.game_id)
                .or_default()
                .push((pid, config.exit_signal));
        }

        Ok(())
    }
}

#[async_trait::async_trait]
impl super::PluginHandler for ExecutePlugin {
    async fn before_game_start(&self, ctx: super::PluginContext) -> Result<()> {
        self.try_execute(&ctx, ExecutePhase::BeforeGameStart)
    }

    async fn after_game_start(&self, ctx: super::PluginContext) -> Result<()> {
        self.try_execute(&ctx, ExecutePhase::AfterGameStart)
    }

    async fn after_game_exit(&self, ctx: super::PluginContext) -> Result<()> {
        if let Some((_, processes)) = TRACKED_PROCESSES.remove(&ctx.launch.game_id) {
            for (pid, signal) in processes {
                if let Err(e) = send_signal(pid, signal) {
                    log::warn!("Failed to send {signal:?} to process {pid}: {e}");
                }
            }
        }

        self.try_execute(&ctx, ExecutePhase::GameExit)
    }
}

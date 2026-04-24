//! VoiceZerointerrupt plugin: prevent voice interruption in games via DLL
//! injection (ZeroInterrupt).
//!
//! Config types are compiled on all platforms (for serialization).
//! The handler is Windows-only.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::config::ArchPreference;

/// Plugin identifier used in the registry and config.
pub const PLUGIN_ID: &str = "voiceZerointerrupt";

// ── Config types (compiled on all platforms) ────────────────────────────────

/// Per-game config for the VoiceZerointerrupt plugin.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[derive(Default)]
pub struct VoiceZerointerruptGameConfig {
    /// Architecture preference for DLL selection.
    pub arch: ArchPreference,
}

/// Global metadata for the VoiceZerointerrupt plugin (stored in
/// `PluginMetadatas`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceZerointerruptPluginMeta {
    pub enabled: bool,
    pub auto_add: bool,
    pub config_defaults: VoiceZerointerruptGameConfig,
}

impl Default for VoiceZerointerruptPluginMeta {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add: false,
            config_defaults: VoiceZerointerruptGameConfig::default(),
        }
    }
}

// ── Handler (Windows only) ─────────────────────────────────────────────────

#[cfg(windows)]
mod win_impl {
    use std::path::Path;

    use log::info;

    use super::ArchPreference;
    use crate::{
        error::Result,
        plugin::{CleanupPhase, PluginConfig, PluginContext, PluginHandler},
        utils::audio_speed_hack,
    };

    pub struct VoiceZerointerruptPlugin;

    impl VoiceZerointerruptPlugin {
        pub fn new() -> Self {
            Self
        }
    }

    #[async_trait::async_trait]
    impl PluginHandler for VoiceZerointerruptPlugin {
        async fn before_game_start(&self, ctx: PluginContext) -> Result<()> {
            let PluginConfig::VoiceZerointerrupt(config) = &*ctx.config else {
                return Ok(());
            };

            let game_dir = Path::new(&ctx.launch.current_dir);

            let system = match config.arch {
                ArchPreference::Auto => audio_speed_hack::System::detect(&ctx.launch.exe_path)
                    .unwrap_or(audio_speed_hack::System::X64),
                ArchPreference::X86 => audio_speed_hack::System::X86,
                ArchPreference::X64 => audio_speed_hack::System::X64,
            };

            let files = audio_speed_hack::extract_zerointerrupt_assets(system, game_dir)?;
            ctx.launch
                .transaction
                .add_cleanup(CleanupPhase::AfterGameExit, move || {
                    audio_speed_hack::cleanup_files(&files);
                });

            info!(
                "VoiceZerointerrupt: prepared for game {} (arch={system})",
                ctx.launch.game_id,
            );
            Ok(())
        }

        async fn after_game_exit(&self, _ctx: PluginContext) -> Result<()> {
            // All cleanup is handled by the Transaction automatically.
            Ok(())
        }
    }
}

#[cfg(windows)]
pub use win_impl::VoiceZerointerruptPlugin;

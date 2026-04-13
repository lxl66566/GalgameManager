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
    use std::{path::Path, sync::LazyLock as Lazy};

    use dashmap::DashMap;
    use log::info;

    use super::ArchPreference;
    use crate::{
        db::CONFIG,
        error::{Error, Result},
        plugin::{PluginConfig, PluginContext, PluginHandler},
        utils::audio_speed_hack,
    };

    static CLEANUP_STATES: Lazy<DashMap<u32, Vec<std::path::PathBuf>>> = Lazy::new(DashMap::new);

    pub struct VoiceZerointerruptPlugin;

    impl VoiceZerointerruptPlugin {
        pub fn new() -> Self {
            Self
        }
    }

    #[async_trait::async_trait]
    impl PluginHandler for VoiceZerointerruptPlugin {
        async fn before_game_start(&self, ctx: PluginContext) -> Result<()> {
            let PluginConfig::VoiceZerointerrupt(ref config) = ctx.config else {
                return Ok(());
            };

            // Resolve the game's executable path
            let exe_path = {
                let lock = CONFIG.lock();
                let raw = lock
                    .get_game_by_id(ctx.game_id)?
                    .excutable_path
                    .as_ref()
                    .ok_or(Error::Launch)?;
                lock.resolve_var(raw)?
            };

            let game_dir = Path::new(&exe_path).parent().ok_or(Error::InvalidPath)?;

            // Determine architecture based on user preference
            let system = match config.arch {
                ArchPreference::Auto => audio_speed_hack::System::detect(&exe_path)
                    .unwrap_or(audio_speed_hack::System::X64),
                ArchPreference::X86 => audio_speed_hack::System::X86,
                ArchPreference::X64 => audio_speed_hack::System::X64,
            };

            // Extract DLLs for ZeroInterrupt
            let files = audio_speed_hack::extract_zerointerrupt_assets(system, game_dir)?;

            CLEANUP_STATES.insert(ctx.game_id, files);

            info!(
                "VoiceZerointerrupt: prepared for game {} (arch={system})",
                ctx.game_id,
            );
            Ok(())
        }

        async fn after_game_exit(&self, ctx: PluginContext) -> Result<()> {
            let PluginConfig::VoiceZerointerrupt(_) = ctx.config else {
                return Ok(());
            };

            if let Some((_, files)) = CLEANUP_STATES.remove(&ctx.game_id) {
                info!("VoiceZerointerrupt: cleaning up after game exit");
                audio_speed_hack::cleanup_files(&files);
            }

            Ok(())
        }
    }
}

#[cfg(windows)]
pub use win_impl::VoiceZerointerruptPlugin;

//! VoiceSpeedup plugin: accelerate game voice playback via DLL injection.
//!
//! Config types are compiled on all platforms (for serialization).
//! The handler is Windows-only.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::config::ArchPreference;

/// Plugin identifier used in the registry and config.
pub const PLUGIN_ID: &str = "voiceSpeedup";

// ── Config types (compiled on all platforms) ────────────────────────────────

/// DLL injection provider for voice speed-up.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum SpeedupProvider {
    #[default]
    MMDevAPI,
    DSound,
}

/// Per-game config for the VoiceSpeedup plugin.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceSpeedupGameConfig {
    /// Playback speed multiplier (1.0 ~ 2.0).
    pub speed: f32,
    /// DLL injection provider.
    pub provider: SpeedupProvider,
    /// Architecture preference for DLL selection.
    pub arch: ArchPreference,
}

impl Default for VoiceSpeedupGameConfig {
    fn default() -> Self {
        Self {
            speed: 1.5,
            provider: SpeedupProvider::default(),
            arch: ArchPreference::default(),
        }
    }
}

/// Global metadata for the VoiceSpeedup plugin (stored in `PluginMetadatas`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceSpeedupPluginMeta {
    pub enabled: bool,
    pub auto_add: bool,
    pub config_defaults: VoiceSpeedupGameConfig,
}

impl Default for VoiceSpeedupPluginMeta {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add: false,
            config_defaults: VoiceSpeedupGameConfig::default(),
        }
    }
}

// ── Handler (Windows only) ─────────────────────────────────────────────────

#[cfg(windows)]
mod win_impl {
    use std::{path::Path, sync::LazyLock as Lazy, time::Duration};

    use dashmap::DashMap;
    use log::info;

    use super::{ArchPreference, SpeedupProvider};
    use crate::{
        db::CONFIG,
        error::{Error, Result},
        plugin::{PluginConfig, PluginContext, PluginHandler},
        utils::audio_speed_hack,
    };

    struct CleanupState {
        extracted_dlls: Vec<std::path::PathBuf>,
        used_mmdevapi: bool,
    }

    static CLEANUP_STATES: Lazy<DashMap<u32, CleanupState>> = Lazy::new(DashMap::new);

    pub struct VoiceSpeedupPlugin;

    impl VoiceSpeedupPlugin {
        pub fn new() -> Self {
            Self
        }
    }

    #[async_trait::async_trait]
    impl PluginHandler for VoiceSpeedupPlugin {
        async fn before_game_start(&self, ctx: PluginContext) -> Result<()> {
            let PluginConfig::VoiceSpeedup(ref config) = ctx.config else {
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

            // Extract DLLs
            let files =
                audio_speed_hack::extract_speedup_assets(system, game_dir, config.provider)?;

            // Set SPEEDUP environment variable
            audio_speed_hack::set_speedup_env(config.speed)?;

            // Set registry for MMDevAPI provider
            let used_mmdevapi = config.provider == SpeedupProvider::MMDevAPI;
            if used_mmdevapi {
                audio_speed_hack::set_mmdevapi_registry()?;
            }

            CLEANUP_STATES.insert(
                ctx.game_id,
                CleanupState {
                    extracted_dlls: files,
                    used_mmdevapi,
                },
            );

            info!(
                "VoiceSpeedup: prepared for game {} (speed={:.1}, provider={:?}, arch={system})",
                ctx.game_id, config.speed, config.provider,
            );
            Ok(())
        }

        async fn after_game_start(&self, ctx: PluginContext) -> Result<()> {
            let PluginConfig::VoiceSpeedup(_) = ctx.config else {
                return Ok(());
            };

            tokio::time::sleep(Duration::from_secs(5)).await;
            if let Some(state) = CLEANUP_STATES.get(&ctx.game_id)
                && state.used_mmdevapi
            {
                // Immediately undo registry modifications after game starts
                info!("VoiceSpeedup: cleaning registry after game start");
                audio_speed_hack::clean_mmdevapi_registry();
            }

            Ok(())
        }

        async fn after_game_exit(&self, ctx: PluginContext) -> Result<()> {
            let PluginConfig::VoiceSpeedup(_) = ctx.config else {
                return Ok(());
            };

            if let Some((_, state)) = CLEANUP_STATES.remove(&ctx.game_id) {
                info!("VoiceSpeedup: cleaning up after game exit");
                audio_speed_hack::cleanup_files(&state.extracted_dlls);
                audio_speed_hack::remove_speedup_env();
            }

            Ok(())
        }
    }
}

#[cfg(windows)]
pub use win_impl::VoiceSpeedupPlugin;

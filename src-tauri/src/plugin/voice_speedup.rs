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
    use std::{path::Path, time::Duration};

    use log::info;

    use super::{ArchPreference, SpeedupProvider};
    use crate::{
        db::CONFIG,
        error::{Error, Result},
        plugin::{CleanupPhase, PluginConfig, PluginContext, PluginHandler}, // 引入 CleanupPhase
        utils::audio_speed_hack,
    };

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

            let system = match config.arch {
                ArchPreference::Auto => audio_speed_hack::System::detect(&exe_path)
                    .unwrap_or(audio_speed_hack::System::X64),
                ArchPreference::X86 => audio_speed_hack::System::X86,
                ArchPreference::X64 => audio_speed_hack::System::X64,
            };

            // 1. 解压 DLL 并注册退出时清理
            let files =
                audio_speed_hack::extract_speedup_assets(system, game_dir, config.provider)?;
            ctx.transaction
                .add_cleanup(CleanupPhase::AfterGameExit, move || {
                    audio_speed_hack::cleanup_files(&files);
                });

            // 2. 设置环境变量并注册退出时清理
            audio_speed_hack::set_speedup_env(config.speed)?;
            ctx.transaction
                .add_cleanup(CleanupPhase::AfterGameExit, || {
                    audio_speed_hack::remove_speedup_env();
                });

            // 3. 设置注册表并注册启动后清理
            let used_mmdevapi = config.provider == SpeedupProvider::MMDevAPI;
            if used_mmdevapi {
                audio_speed_hack::set_mmdevapi_registry()?;
                ctx.transaction
                    .add_cleanup(CleanupPhase::AfterGameStart, || {
                        audio_speed_hack::clean_mmdevapi_registry();
                    });
            }

            info!(
                "VoiceSpeedup: prepared for game {} (speed={:.1}, provider={:?}, arch={system})",
                ctx.game_id, config.speed, config.provider
            );
            Ok(())
        }

        async fn after_game_start(&self, ctx: PluginContext) -> Result<()> {
            let PluginConfig::VoiceSpeedup(ref config) = ctx.config else {
                return Ok(());
            };

            // 阻塞 5 秒。这会使得启动器中的 tx_start.execute_after_start() 延迟 5
            // 秒执行，符合等待游戏加载完 DLL 后再清理注册表的需求。
            if config.provider == SpeedupProvider::MMDevAPI {
                tokio::time::sleep(Duration::from_secs(5)).await;
            }

            Ok(())
        }

        async fn after_game_exit(&self, _ctx: PluginContext) -> Result<()> {
            // 所有的清理工作已经交由 Transaction 自动处理，这里无需任何代码
            Ok(())
        }
    }
}

#[cfg(windows)]
pub use win_impl::VoiceSpeedupPlugin;

//! VoiceSpeedup plugin: accelerate game voice playback via DLL injection.
//!
//! Config types are compiled on all platforms (for serialization).
//! The handler runs on Windows (native DLL inject + registry) and on Linux
//! (DLL inject + Wine prefix registry / `WINEDLLOVERRIDES`).

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
        error::Result,
        plugin::{CleanupPhase, PluginConfig, PluginContext, PluginHandler},
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
            let PluginConfig::VoiceSpeedup(config) = &*ctx.config else {
                return Ok(());
            };

            let game_dir = Path::new(&ctx.launch.current_dir);

            let system = match config.arch {
                ArchPreference::Auto => audio_speed_hack::System::detect(&ctx.launch.exe_path)
                    .unwrap_or(audio_speed_hack::System::X64),
                ArchPreference::X86 => audio_speed_hack::System::X86,
                ArchPreference::X64 => audio_speed_hack::System::X64,
            };

            let files =
                audio_speed_hack::extract_speedup_assets(system, game_dir, config.provider)?;
            ctx.launch
                .transaction
                .add_cleanup(CleanupPhase::AfterGameExit, move || {
                    audio_speed_hack::cleanup_files(&files);
                });

            audio_speed_hack::set_speedup_env(config.speed)?;
            ctx.launch
                .transaction
                .add_cleanup(CleanupPhase::AfterGameExit, || {
                    audio_speed_hack::remove_speedup_env();
                });

            let used_mmdevapi = config.provider == SpeedupProvider::MMDevAPI;
            if used_mmdevapi {
                audio_speed_hack::set_mmdevapi_registry()?;
                ctx.launch
                    .transaction
                    .add_cleanup(CleanupPhase::AfterGameStart, || {
                        audio_speed_hack::clean_mmdevapi_registry();
                    });
            }

            info!(
                "VoiceSpeedup: prepared for game {} (speed={:.1}, provider={:?}, arch={system})",
                ctx.launch.game_id, config.speed, config.provider
            );
            Ok(())
        }

        async fn after_game_start(&self, ctx: PluginContext) -> Result<()> {
            let PluginConfig::VoiceSpeedup(config) = &*ctx.config else {
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

// ── Handler (Linux / Wine) ──────────────────────────────────────────────────

#[cfg(target_os = "linux")]
mod linux_impl {
    use std::path::Path;

    use log::info;

    use super::{ArchPreference, SpeedupProvider};
    use crate::{
        error::Result,
        plugin::{
            CleanupPhase, DllOverride, PluginConfig, PluginContext, PluginHandler,
            wine::wine_prefix_for_game,
        },
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
            let PluginConfig::VoiceSpeedup(config) = &*ctx.config else {
                return Ok(());
            };

            let game_dir = Path::new(&ctx.launch.current_dir);

            let system = match config.arch {
                ArchPreference::Auto => audio_speed_hack::System::detect(&ctx.launch.exe_path)
                    .unwrap_or(audio_speed_hack::System::X64),
                ArchPreference::X86 => audio_speed_hack::System::X86,
                ArchPreference::X64 => audio_speed_hack::System::X64,
            };

            let files =
                audio_speed_hack::extract_speedup_assets(system, game_dir, config.provider)?;
            ctx.launch
                .transaction
                .add_cleanup(CleanupPhase::AfterGameExit, move || {
                    audio_speed_hack::cleanup_files(&files);
                });

            // SPEEDUP env → injected into the Wine process via the overlay
            // (consumed by the Wine plugin's launch override). No persistent
            // system env exists to clean up here, unlike on Windows.
            ctx.launch.env_overlay.lock().insert(
                audio_speed_hack::SPEEDUP_ENV_NAME.to_string(),
                format!("{:.1}", config.speed),
            );

            // Request a WINEDLLOVERRIDES entry so Wine loads our wrapper from
            // the game dir (native) while still letting the wrapper fall back
            // to the builtin implementation for the "real" system DLL.
            {
                let mut overlay = ctx.launch.dll_override_overlay.lock();
                match config.provider {
                    SpeedupProvider::DSound => {
                        overlay.insert("dsound".to_string(), DllOverride::NativeBuiltin);
                    }
                    SpeedupProvider::MMDevAPI => {
                        overlay.insert(
                            "MMDevAPI".to_string(),
                            DllOverride::NativeBuiltin,
                        );
                    }
                }
                // SoundTouch.dll is also extracted to the game directory and
                // loaded implicitly by the wrapper; make Wine resolve it from
                // the game dir as well.
                overlay.insert("SoundTouch".to_string(), DllOverride::NativeBuiltin);
            }

            // MMDevAPI: redirect COM to our wrapper via the Wine prefix
            // registry. The wrapper is loaded relative to the game's working
            // directory, so no `mmdevapi` file needs to live in system32.
            if config.provider == SpeedupProvider::MMDevAPI {
                let prefix = wine_prefix_for_game(ctx.launch.game_id);
                let prefix_for_cleanup = prefix.clone();
                let res = tokio::task::spawn_blocking(move || {
                    audio_speed_hack::set_mmdevapi_registry(prefix.as_deref())
                })
                .await
                .map_err(|e| std::io::Error::other(format!("regedit join failed: {e}")))?;
                if let Err(e) = res {
                    log::warn!("VoiceSpeedup: failed to set wine MMDevAPI registry: {e}");
                }
                ctx.launch
                    .transaction
                    .add_cleanup(CleanupPhase::AfterGameStart, move || {
                        audio_speed_hack::clean_mmdevapi_registry(prefix_for_cleanup.as_deref());
                    });
            }

            info!(
                "VoiceSpeedup: prepared for game {} on Wine (speed={:.1}, provider={:?}, arch={system})",
                ctx.launch.game_id, config.speed, config.provider
            );
            Ok(())
        }

        async fn after_game_start(&self, ctx: PluginContext) -> Result<()> {
            let PluginConfig::VoiceSpeedup(config) = &*ctx.config else {
                return Ok(());
            };

            // Match the Windows behaviour: hold the MMDevAPI registry redirect
            // for ~5s so the game loads the DLL before the AfterGameStart
            // cleanup (registered above) tears it down.
            if config.provider == SpeedupProvider::MMDevAPI {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }

            Ok(())
        }
    }
}

#[cfg(target_os = "linux")]
pub use linux_impl::VoiceSpeedupPlugin;

// ── Handler stub (other platforms) ──────────────────────────────────────────

// On platforms without a real implementation the handler is a silent no-op so
// that the plugin remains visible and configurable without breaking launches.
#[cfg(not(any(windows, target_os = "linux")))]
mod stub_impl {
    use crate::{
        error::Result,
        plugin::{PluginConfig, PluginContext, PluginHandler},
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
            if let PluginConfig::VoiceSpeedup(_) = &*ctx.config {
                log::warn!(
                    "VoiceSpeedup: dll injection is not supported on this platform, skipping for game {}",
                    ctx.launch.game_id
                );
            }
            Ok(())
        }
    }
}

#[cfg(not(any(windows, target_os = "linux")))]
pub use stub_impl::VoiceSpeedupPlugin;

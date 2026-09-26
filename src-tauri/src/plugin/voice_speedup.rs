//! VoiceSpeedup plugin: accelerate game voice playback via DLL injection.
//!
//! Config types are compiled on all platforms (for serialization).
//! The handler runs on Windows (native DLL inject + registry) and on Linux
//! (DLL inject + Wine prefix registry / `WINEDLLOVERRIDES`).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::config::{ArchPreference, PluginConfig};

/// Plugin identifier used in the registry and config.
pub const PLUGIN_ID: &str = "voiceSpeedup";

/// i18n toast tokens for live speed updates (resolved frontend-side via
/// `<i18n.key>` substitution).
const TOAST_LIVE_UPDATED: &str = "<plugin.voiceSpeedup.liveSpeedUpdated>";
const TOAST_LIVE_FAILED: &str = "<plugin.voiceSpeedup.liveSpeedUpdateFailed>";

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

// ── Live speed diff (all platforms) ─────────────────────────────────────────

/// Effective live speed of a config group: the *last* VoiceSpeedup instance
/// wins, matching launch where each instance's `before_game_start` overwrites
/// the SPEEDUP value set by the previous one.
fn effective_speed(configs: &[PluginConfig]) -> Option<f32> {
    configs.iter().rev().find_map(|c| match c {
        PluginConfig::VoiceSpeedup(config) => Some(config.speed),
        _ => None,
    })
}

/// The new speed to push into a running session, or `None` when there is
/// nothing to do: no pre-patch instance (the DLL was never injected — writing
/// an env value would leak with no exit cleanup), no post-patch instance
/// (nothing to push), or an unchanged value.
fn speed_change(old: &[PluginConfig], new: &[PluginConfig]) -> Option<f32> {
    let (old, new) = (effective_speed(old)?, effective_speed(new)?);
    // Exact equality is intentional: both sides are the same user-input f32
    // round-tripped through the config store, so any bit difference is a real
    // edit and a "close enough" match would skip legitimate updates.
    #[allow(clippy::float_cmp)]
    let changed = old != new;
    changed.then_some(new)
}

#[cfg(test)]
mod speed_diff_tests {
    use super::*;
    use crate::plugin::config::VoiceZerointerruptGameConfig;

    fn speedup(speed: f32) -> PluginConfig {
        PluginConfig::VoiceSpeedup(VoiceSpeedupGameConfig {
            speed,
            ..VoiceSpeedupGameConfig::default()
        })
    }

    #[test]
    fn last_instance_wins() {
        assert_eq!(effective_speed(&[speedup(1.5), speedup(1.8)]), Some(1.8));
        assert_eq!(effective_speed(&[speedup(1.8)]), Some(1.8));
        assert_eq!(effective_speed(&[]), None);
    }

    #[test]
    fn ignores_other_plugin_configs() {
        let mixed = vec![
            PluginConfig::VoiceZerointerrupt(VoiceZerointerruptGameConfig::default()),
            speedup(1.5),
        ];
        assert_eq!(effective_speed(&mixed), Some(1.5));
        assert_eq!(effective_speed(&mixed[..1]), None);
    }

    #[test]
    fn speed_change_requires_both_sides_and_a_difference() {
        assert_eq!(speed_change(&[speedup(1.5)], &[speedup(2.0)]), Some(2.0));
        assert_eq!(speed_change(&[speedup(1.5)], &[speedup(1.5)]), None);
        assert_eq!(speed_change(&[], &[speedup(2.0)]), None);
        assert_eq!(speed_change(&[speedup(1.5)], &[]), None);
    }
}

// ── Handler (Windows only) ─────────────────────────────────────────────────

#[cfg(windows)]
mod win_impl {
    use std::path::Path;

    use log::info;
    use tauri::Manager as _;

    use super::{
        ArchPreference, SpeedupProvider, TOAST_LIVE_FAILED, TOAST_LIVE_UPDATED, speed_change,
    };
    use crate::{
        error::Result,
        plugin::{CleanupPhase, LiveUpdateCtx, PluginConfig, PluginContext, PluginHandler},
        utils::{
            audio_speed_hack,
            toast::{ToastVariant, emit_toast},
        },
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

            if config.provider == SpeedupProvider::MMDevAPI {
                // stub 部署在应用 local 数据目录（非 config，避免污染用户配置）
                let stub_dir = ctx.launch.app.path().app_local_data_dir()?;
                audio_speed_hack::set_mmdevapi_registry(&stub_dir)?;
                // 注册表指向纯透传的转发 stub，整个游戏会话期间保留不影响其他
                // 进程，还能覆盖游戏晚启动子进程/延迟初始化音频的情况，
                // 因此到游戏退出时再回收（stub 文件本身不回收）
                ctx.launch
                    .transaction
                    .add_cleanup(CleanupPhase::AfterGameExit, || {
                        audio_speed_hack::clean_mmdevapi_registry();
                    });
            }

            info!(
                "VoiceSpeedup: prepared for game {} (speed={:.1}, provider={:?}, arch={system})",
                ctx.launch.game_id, config.speed, config.provider
            );
            Ok(())
        }

        async fn after_game_exit(&self, _ctx: PluginContext) -> Result<()> {
            // 所有的清理工作已经交由 Transaction 自动处理，这里无需任何代码
            Ok(())
        }

        async fn on_live_update(&self, ctx: LiveUpdateCtx) -> Result<()> {
            let Some(speed) = speed_change(&ctx.old, &ctx.new) else {
                return Ok(());
            };
            match audio_speed_hack::update_speedup_env(speed) {
                Ok(()) => {
                    emit_toast(&ctx.app, ToastVariant::Success, TOAST_LIVE_UPDATED);
                    Ok(())
                },
                Err(e) => {
                    emit_toast(
                        &ctx.app,
                        ToastVariant::Error,
                        format!("{TOAST_LIVE_FAILED}{e}"),
                    );
                    Err(e)
                },
            }
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

    use super::{
        ArchPreference, SpeedupProvider, TOAST_LIVE_FAILED, TOAST_LIVE_UPDATED, speed_change,
    };
    use crate::{
        error::Result,
        plugin::{
            CleanupPhase, DllOverride, LiveUpdateCtx, PluginConfig, PluginContext, PluginHandler,
            wine::wine_prefix_for_game,
        },
        utils::{
            audio_speed_hack,
            toast::{ToastVariant, emit_toast},
        },
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

            // SPEEDUP reaches the game twice: as a process env var via the
            // overlay (consumed by the Wine plugin's launch override), and
            // mirrored into the prefix registry's `HKCU\Environment` — the
            // injected DLL reads it through the registry API, same as on
            // Windows. The mirror also gives the live-update path
            // (`on_live_update`) a value to overwrite and this cleanup a
            // matching removal, so a live-updated value can't leak past the
            // session.
            ctx.launch.env_overlay.lock().insert(
                audio_speed_hack::SPEEDUP_ENV_NAME.to_string(),
                format!("{:.1}", config.speed),
            );
            let prefix = wine_prefix_for_game(ctx.launch.game_id);
            {
                let speed = config.speed;
                let prefix_for_set = prefix.clone();
                let res = match tokio::task::spawn_blocking(move || {
                    audio_speed_hack::set_speedup_env_registry(prefix_for_set.as_deref(), speed)
                })
                .await
                {
                    Ok(r) => r,
                    Err(e) => Err(std::io::Error::other(format!("regedit join failed: {e}"))),
                };
                if let Err(e) = res {
                    log::warn!("VoiceSpeedup: failed to set wine SPEEDUP registry: {e}");
                }
            }
            let prefix_for_cleanup = prefix.clone();
            ctx.launch
                .transaction
                .add_cleanup(CleanupPhase::AfterGameExit, move || {
                    audio_speed_hack::clean_speedup_env_registry(prefix_for_cleanup.as_deref());
                });

            // Request a WINEDLLOVERRIDES entry so Wine loads our wrapper from
            // the game dir (native) while still letting the wrapper fall back
            // to the builtin implementation for the "real" system DLL.
            {
                let mut overlay = ctx.launch.dll_override_overlay.lock();
                match config.provider {
                    SpeedupProvider::DSound => {
                        overlay.insert("dsound".to_string(), DllOverride::NativeBuiltin);
                    },
                    SpeedupProvider::MMDevAPI => {
                        overlay.insert("MMDevAPI".to_string(), DllOverride::NativeBuiltin);
                    },
                }
                // SoundTouch.dll is also extracted to the game directory and
                // loaded implicitly by the wrapper; make Wine resolve it from
                // the game dir as well.
                overlay.insert("SoundTouch".to_string(), DllOverride::NativeBuiltin);
            }

            // MMDevAPI: redirect COM to our wrapper via the Wine prefix
            // registry. The registry points at the pass-through forwarding
            // stub (deployed to the prefix's C:\ root), so keeping it for the
            // whole session is safe; it is reclaimed when the game exits and
            // the stub files themselves are never removed.
            if config.provider == SpeedupProvider::MMDevAPI {
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
                    .add_cleanup(CleanupPhase::AfterGameExit, move || {
                        audio_speed_hack::clean_mmdevapi_registry(prefix_for_cleanup.as_deref());
                    });
            }

            info!(
                "VoiceSpeedup: prepared for game {} on Wine (speed={:.1}, provider={:?}, \
                 arch={system})",
                ctx.launch.game_id, config.speed, config.provider
            );
            Ok(())
        }

        async fn on_live_update(&self, ctx: LiveUpdateCtx) -> Result<()> {
            let Some(speed) = speed_change(&ctx.old, &ctx.new) else {
                return Ok(());
            };
            let app = ctx.app.clone();
            let prefix = ctx.wine_prefix.clone();
            let res = match tokio::task::spawn_blocking(move || {
                audio_speed_hack::set_speedup_env_registry(prefix.as_deref(), speed)
            })
            .await
            {
                Ok(r) => r,
                Err(e) => Err(std::io::Error::other(format!("regedit join failed: {e}"))),
            };
            match res {
                Ok(()) => {
                    emit_toast(&app, ToastVariant::Success, TOAST_LIVE_UPDATED);
                    Ok(())
                },
                Err(e) => {
                    emit_toast(&app, ToastVariant::Error, format!("{TOAST_LIVE_FAILED}{e}"));
                    Err(e.into())
                },
            }
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
                    "VoiceSpeedup: dll injection is not supported on this platform, skipping for \
                     game {}",
                    ctx.launch.game_id
                );
            }
            Ok(())
        }
    }
}

#[cfg(not(any(windows, target_os = "linux")))]
pub use stub_impl::VoiceSpeedupPlugin;

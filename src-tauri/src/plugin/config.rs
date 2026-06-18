//! Aggregated plugin config types.
//!
//! This module re-exports per-plugin config types from their own modules and
//! defines the top-level tagged unions (`PluginInstance`, `PluginMetadatas`,
//! `PluginConfig`) that aggregate all plugins.
//!
//! ## Adding a new plugin
//!
//! 1. Create a new file (e.g. `my_plugin.rs`) with config types + handler.
//! 2. Add `mod my_plugin;` in `mod.rs`.
//! 3. Add a new variant to `PluginInstance` below.
//! 4. Add a new field to `PluginMetadatas` below.
//! 5. Add a new variant to `PluginConfig` below.
//! 6. Update `handler_key()` and `is_enabled()` in their respective modules,
//!    and add a match arm to `instance_config()` in `mod.rs`.
//! 7. Register the handler in the `PluginRegistry` constructor in `mod.rs`.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ── Shared enums ──

/// Architecture preference for DLL injection.
///
/// - `Auto`: detect from game executable (default)
/// - `X86`:  force 32-bit DLLs
/// - `X64`:  force 64-bit DLLs
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum ArchPreference {
    #[default]
    Auto,
    X86,
    X64,
}

// Re-export per-plugin config types for downstream convenience.
pub use super::{
    auto_upload::{AutoUploadGameConfig, AutoUploadPluginMeta, RetentionScope},
    execute::{ExecuteGameConfig, ExecutePhase, ExecutePluginMeta, ExitSignal},
    game_wrapper::{GameWrapperGameConfig, GameWrapperPluginMeta},
    locale_emulator::{LocaleEmulatorGameConfig, LocaleEmulatorPluginMeta},
    translator::{TranslatorGameConfig, TranslatorPluginMeta},
    voice_speedup::{SpeedupProvider, VoiceSpeedupGameConfig, VoiceSpeedupPluginMeta},
    voice_zerointerrupt::{VoiceZerointerruptGameConfig, VoiceZerointerruptPluginMeta},
    wine::{DllOverride, WineArch, WineGameConfig, WinePluginMeta},
};

// ── Plugin instance (tagged union)
// ────────────────────────────────────────────

/// A plugin instance attached to a game.
///
/// This is a tagged union where the `pluginId` field discriminates the variant.
/// The same plugin can be attached multiple times to the same game, each with
/// its own config values.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "pluginId", rename_all = "camelCase")]
pub enum PluginInstance {
    Execute {
        #[serde(default)]
        config: ExecuteGameConfig,
    },
    AutoUpload {
        #[serde(default)]
        config: AutoUploadGameConfig,
    },
    VoiceSpeedup {
        #[serde(default)]
        config: VoiceSpeedupGameConfig,
    },
    VoiceZerointerrupt {
        #[serde(default)]
        config: VoiceZerointerruptGameConfig,
    },
    GameWrapper {
        #[serde(default)]
        config: GameWrapperGameConfig,
    },
    LocaleEmulator {
        #[serde(default)]
        config: LocaleEmulatorGameConfig,
    },
    Translator {
        #[serde(default)]
        config: TranslatorGameConfig,
    },
    Wine {
        #[serde(default)]
        config: WineGameConfig,
    },
}

impl PluginInstance {
    /// Return the handler key used to look up the `PluginHandler` in the
    /// registry.
    pub fn handler_key(&self) -> &'static str {
        match self {
            Self::Execute { .. } => super::execute::PLUGIN_ID,
            Self::AutoUpload { .. } => super::auto_upload::PLUGIN_ID,
            Self::VoiceSpeedup { .. } => super::voice_speedup::PLUGIN_ID,
            Self::VoiceZerointerrupt { .. } => super::voice_zerointerrupt::PLUGIN_ID,
            Self::GameWrapper { .. } => super::game_wrapper::PLUGIN_ID,
            Self::LocaleEmulator { .. } => super::locale_emulator::PLUGIN_ID,
            Self::Translator { .. } => super::translator::PLUGIN_ID,
            Self::Wine { .. } => super::wine::PLUGIN_ID,
        }
    }
}

// ── Global plugin metadatas
// ───────────────────────────────────────────

/// Per-plugin-type metadata, keyed by plugin ID.
///
/// Stored in `Config.plugin_metadatas`. Each field corresponds to a registered
/// plugin and carries its typed metadata.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct PluginMetadatas {
    pub execute: ExecutePluginMeta,
    pub auto_upload: AutoUploadPluginMeta,
    pub voice_speedup: VoiceSpeedupPluginMeta,
    pub voice_zerointerrupt: VoiceZerointerruptPluginMeta,
    pub game_wrapper: GameWrapperPluginMeta,
    pub locale_emulator: LocaleEmulatorPluginMeta,
    pub translator: TranslatorPluginMeta,
    pub wine: WinePluginMeta,
}

impl PluginMetadatas {
    /// Check whether the plugin that owns the given instance is enabled.
    pub fn is_enabled(&self, instance: &PluginInstance) -> bool {
        match instance {
            PluginInstance::Execute { .. } => self.execute.enabled,
            PluginInstance::AutoUpload { .. } => self.auto_upload.enabled,
            PluginInstance::VoiceSpeedup { .. } => self.voice_speedup.enabled,
            PluginInstance::VoiceZerointerrupt { .. } => self.voice_zerointerrupt.enabled,
            PluginInstance::GameWrapper { .. } => self.game_wrapper.enabled,
            PluginInstance::LocaleEmulator { .. } => self.locale_emulator.enabled,
            PluginInstance::Translator { .. } => self.translator.enabled,
            PluginInstance::Wine { .. } => self.wine.enabled,
        }
    }
}

// ── Runtime context enum ─────────────────────────────────────────────────────

/// Typed per-game config carried inside `PluginContext`.
#[derive(Debug, Clone)]
pub enum PluginConfig {
    Execute(ExecuteGameConfig),
    AutoUpload(AutoUploadGameConfig),
    VoiceSpeedup(VoiceSpeedupGameConfig),
    VoiceZerointerrupt(VoiceZerointerruptGameConfig),
    GameWrapper(GameWrapperGameConfig),
    LocaleEmulator(LocaleEmulatorGameConfig),
    Translator(TranslatorGameConfig),
    Wine(WineGameConfig),
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Sample instance with a non-default value in each variant, so that
    /// roundtrip mismatches would actually surface.
    fn sample_instances() -> Vec<PluginInstance> {
        vec![
            PluginInstance::Execute {
                config: ExecuteGameConfig {
                    on: ExecutePhase::GameExit,
                    cmd: "echo hi".into(),
                    pass_exe_path: true,
                    current_dir: "/tmp".into(),
                    env: [("K".into(), "V".into())].into(),
                    exit_signal: ExitSignal::Sigterm,
                },
            },
            PluginInstance::AutoUpload {
                config: AutoUploadGameConfig {
                    max_kept: 7,
                    retention_scope: RetentionScope::Local,
                },
            },
            PluginInstance::VoiceSpeedup {
                config: VoiceSpeedupGameConfig {
                    speed: 2.0,
                    provider: SpeedupProvider::DSound,
                    arch: ArchPreference::X64,
                },
            },
            PluginInstance::VoiceZerointerrupt {
                config: VoiceZerointerruptGameConfig {
                    arch: ArchPreference::X86,
                },
            },
            PluginInstance::GameWrapper {
                config: GameWrapperGameConfig {
                    cmd: "wine {}".into(),
                    current_dir: "/x".into(),
                    env: [("A".into(), "B".into())].into(),
                },
            },
            PluginInstance::LocaleEmulator {
                config: LocaleEmulatorGameConfig {
                    cmd: "LEProc.exe {}".into(),
                },
            },
            PluginInstance::Translator {
                config: TranslatorGameConfig {
                    cmd: "t {}".into(),
                    current_dir: "/t".into(),
                    exit_signal: ExitSignal::Sigkill,
                },
            },
            PluginInstance::Wine {
                config: WineGameConfig {
                    prefix: "/prefix".into(),
                    arch: WineArch::Win32,
                    esync: true,
                    fsync: false,
                    dll_overrides: [("d3d9".into(), DllOverride::Native)].into(),
                    locale: "ja_JP.UTF-8".into(),
                    kill_wineserver_on_exit: true,
                    extra_env: [("X".into(), "Y".into())].into(),
                },
            },
        ]
    }

    #[test]
    fn every_variant_has_distinct_handler_key() {
        let instances = sample_instances();
        let keys: Vec<&str> = instances.iter().map(|i| i.handler_key()).collect();
        // No duplicate handler keys.
        let mut sorted = keys.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(keys.len(), sorted.len(), "duplicate handler_key detected");
        // Sanity: a few well-known ids are present.
        assert!(keys.contains(&"execute"));
        assert!(keys.contains(&"wine"));
        assert!(keys.contains(&"autoUpload"));
    }

    #[test]
    fn plugin_instance_serde_roundtrip_preserves_variant_and_values() {
        // The `#[serde(tag = "pluginId")]` tag is what the frontend uses to
        // discriminate variants; ensure we can deserialize exactly what we
        // serialize, including the camelCase tag form.
        for inst in sample_instances() {
            let json = serde_json::to_string(&inst).unwrap();
            let back: PluginInstance = serde_json::from_str(&json).unwrap();
            // Re-serialize and compare bytes — cheap way to assert full equality
            // without manually deriving PartialEq across all sub-types.
            assert_eq!(serde_json::to_string(&back).unwrap(), json);
        }
    }

    #[test]
    fn plugin_instance_uses_camel_case_tag() {
        // Frontend (TS bindings) expects camelCase ids; verify a couple.
        let json = serde_json::to_string(&PluginInstance::AutoUpload {
            config: AutoUploadGameConfig::default(),
        })
        .unwrap();
        assert!(json.contains(r#""pluginId":"autoUpload""#), "got: {json}");

        let json = serde_json::to_string(&PluginInstance::VoiceZerointerrupt {
            config: VoiceZerointerruptGameConfig::default(),
        })
        .unwrap();
        assert!(
            json.contains(r#""pluginId":"voiceZerointerrupt""#),
            "got: {json}"
        );
    }

    #[test]
    fn metadata_is_enabled_matches_variant() {
        // Build a metadata bag where every plugin is enabled.
        let mut metas = PluginMetadatas::default();
        metas.execute.enabled = true;
        metas.auto_upload.enabled = true;
        metas.voice_speedup.enabled = true;
        metas.voice_zerointerrupt.enabled = true;
        metas.game_wrapper.enabled = true;
        metas.locale_emulator.enabled = true;
        metas.translator.enabled = true;
        metas.wine.enabled = true;

        for inst in &sample_instances() {
            assert!(metas.is_enabled(inst), "{:?} should be enabled", inst);
        }

        // Disable one and check the corresponding variant flips.
        metas.wine.enabled = false;
        let wine = PluginInstance::Wine {
            config: WineGameConfig::default(),
        };
        assert!(!metas.is_enabled(&wine));
    }
}

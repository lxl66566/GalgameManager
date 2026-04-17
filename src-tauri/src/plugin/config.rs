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
//! 6. Update `handler_key()`, `is_enabled()`, and `make_plugin_context()` in
//!    `mod.rs` with one match arm each.
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
    auto_upload::AutoUploadPluginMeta,
    execute::{ExecuteGameConfig, ExecutePhase, ExecutePluginMeta, ExitSignal},
    game_wrapper::{GameWrapperGameConfig, GameWrapperPluginMeta},
    locale_emulator::{LocaleEmulatorGameConfig, LocaleEmulatorPluginMeta},
    translator::{TranslatorGameConfig, TranslatorPluginMeta},
    voice_speedup::{SpeedupProvider, VoiceSpeedupGameConfig, VoiceSpeedupPluginMeta},
    voice_zerointerrupt::{VoiceZerointerruptGameConfig, VoiceZerointerruptPluginMeta},
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
    AutoUpload,
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
}

impl PluginInstance {
    /// Return the handler key used to look up the `PluginHandler` in the
    /// registry.
    pub fn handler_key(&self) -> &'static str {
        match self {
            Self::Execute { .. } => super::execute::PLUGIN_ID,
            Self::AutoUpload => super::auto_upload::PLUGIN_ID,
            Self::VoiceSpeedup { .. } => super::voice_speedup::PLUGIN_ID,
            Self::VoiceZerointerrupt { .. } => super::voice_zerointerrupt::PLUGIN_ID,
            Self::GameWrapper { .. } => super::game_wrapper::PLUGIN_ID,
            Self::LocaleEmulator { .. } => super::locale_emulator::PLUGIN_ID,
            Self::Translator { .. } => super::translator::PLUGIN_ID,
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
}

impl PluginMetadatas {
    /// Check whether the plugin that owns the given instance is enabled.
    pub fn is_enabled(&self, instance: &PluginInstance) -> bool {
        match instance {
            PluginInstance::Execute { .. } => self.execute.enabled,
            PluginInstance::AutoUpload => self.auto_upload.enabled,
            PluginInstance::VoiceSpeedup { .. } => self.voice_speedup.enabled,
            PluginInstance::VoiceZerointerrupt { .. } => self.voice_zerointerrupt.enabled,
            PluginInstance::GameWrapper { .. } => self.game_wrapper.enabled,
            PluginInstance::LocaleEmulator { .. } => self.locale_emulator.enabled,
            PluginInstance::Translator { .. } => self.translator.enabled,
        }
    }
}

// ── Runtime context enum ─────────────────────────────────────────────────────

/// Typed per-game config carried inside `PluginContext`.
#[derive(Debug, Clone)]
pub enum PluginConfig {
    Execute(ExecuteGameConfig),
    AutoUpload,
    VoiceSpeedup(VoiceSpeedupGameConfig),
    VoiceZerointerrupt(VoiceZerointerruptGameConfig),
    GameWrapper(GameWrapperGameConfig),
    LocaleEmulator(LocaleEmulatorGameConfig),
    Translator(TranslatorGameConfig),
}

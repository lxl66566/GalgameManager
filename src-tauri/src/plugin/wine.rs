//! Wine plugin: launch Windows games through Wine on Linux.
//!
//! Config types are compiled on all platforms (for serialization / config
//! sync). The handler is a real implementation on Linux and a silent no-op
//! elsewhere, so that the plugin stays visible and configurable on every
//! platform without breaking behavior.

use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::Result;

use super::{PluginConfig, PluginContext};
use crate::exec::StartCtx;

/// Plugin identifier used in the registry and config.
pub const PLUGIN_ID: &str = "wine";

// ── Config types (compiled on all platforms) ────────────────────────────────

/// Wine architecture preference, mapped to the `WINEARCH` env var.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
pub enum WineArch {
    #[default]
    Win64,
    Win32,
}

/// DLL override strategy, mapped to `WINEDLLOVERRIDES` entries.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum DllOverride {
    /// `""` — disable the DLL entirely.
    Disabled,
    /// `native` — load the DLL from the prefix.
    #[default]
    Native,
    /// `builtin` — load the Wine-internal implementation.
    Builtin,
    /// `native,builtin`
    NativeBuiltin,
    /// `builtin,native`
    BuiltinNative,
}

impl DllOverride {
    /// Render the value for the `WINEDLLOVERRIDES` env var.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    const fn as_wine_str(self) -> &'static str {
        match self {
            Self::Disabled => "",
            Self::Native => "native",
            Self::Builtin => "builtin",
            Self::NativeBuiltin => "native,builtin",
            Self::BuiltinNative => "builtin,native",
        }
    }
}

/// Per-game config for the Wine plugin.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WineGameConfig {
    /// `WINEPREFIX` path. Supports `~` and `{variables}`. Empty falls back
    /// to Wine's default (`~/.wine`).
    pub prefix: String,
    /// `WINEARCH` value.
    pub arch: WineArch,
    /// Sets `WINEESYNC=1` when true.
    pub esync: bool,
    /// Sets `WINEFSYNC=1` when true.
    pub fsync: bool,
    /// Entries for the `WINEDLLOVERRIDES` env var.
    pub dll_overrides: BTreeMap<String, DllOverride>,
    /// `LC_ALL` override, e.g. `"ja_JP.UTF-8"`. Empty = no override.
    pub locale: String,
    /// Run `wineserver -k` after the game exits to tear down the prefix.
    pub kill_wineserver_on_exit: bool,
    /// Additional env vars, applied on top of the Wine-derived ones.
    pub extra_env: HashMap<String, String>,
}

impl Default for WineGameConfig {
    fn default() -> Self {
        Self {
            prefix: String::new(),
            arch: WineArch::default(),
            esync: false,
            fsync: false,
            dll_overrides: BTreeMap::new(),
            locale: String::new(),
            kill_wineserver_on_exit: false,
            extra_env: HashMap::new(),
        }
    }
}

/// Global metadata for the Wine plugin (stored in `PluginMetadatas`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WinePluginMeta {
    pub enabled: bool,
    pub auto_add: bool,
    pub config_defaults: WineGameConfig,
}

impl Default for WinePluginMeta {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_add: false,
            config_defaults: WineGameConfig::default(),
        }
    }
}

// ── Handler ─────────────────────────────────────────────────────────────────

pub struct WinePlugin;

impl WinePlugin {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl super::PluginHandler for WinePlugin {
    fn get_launch_override(&self, ctx: &PluginContext) -> Result<Option<StartCtx>> {
        let PluginConfig::Wine(config) = &*ctx.config else {
            return Ok(None);
        };

        // Non-Linux platforms: Wine is not available. Silently skip so the
        // plugin remains configurable without breaking game launches.
        #[cfg(not(target_os = "linux"))]
        {
            log::warn!(
                "WinePlugin: wine is not supported on this platform, skipping launch override \
                 for game {}",
                ctx.launch.game_id
            );
            let _ = config;
            return Ok(None);
        }

        #[cfg(target_os = "linux")]
        {
            use crate::db::device::ResolveVar;

            // Clone the varmap under the CONFIG lock, then resolve values
            // without holding the lock during env assembly.
            let varmap = {
                let lock = crate::db::CONFIG.lock();
                lock.varmap().clone()
            };

            let mut env: HashMap<String, String> = config.extra_env.clone();

            if !config.prefix.is_empty() {
                env.insert("WINEPREFIX".to_string(), varmap.resolve_var(&config.prefix)?);
            }
            env.insert(
                "WINEARCH".to_string(),
                match config.arch {
                    WineArch::Win32 => "win32".to_string(),
                    WineArch::Win64 => "win64".to_string(),
                },
            );
            if config.esync {
                env.insert("WINEESYNC".to_string(), "1".to_string());
            }
            if config.fsync {
                env.insert("WINEFSYNC".to_string(), "1".to_string());
            }
            if !config.dll_overrides.is_empty() {
                let joined: String = config
                    .dll_overrides
                    .iter()
                    .map(|(dll, o)| format!("{dll}={}", o.as_wine_str()))
                    .collect::<Vec<_>>()
                    .join(";");
                env.insert("WINEDLLOVERRIDES".to_string(), joined);
            }
            if !config.locale.is_empty() {
                env.insert("LC_ALL".to_string(), varmap.resolve_var(&config.locale)?);
            }

            // Resolve any variables inside extra_env values.
            let resolved_env: HashMap<String, String> = env
                .into_iter()
                .map(|(k, v)| match varmap.resolve_var(&v) {
                    Ok(resolved) => (k, resolved),
                    Err(_) => (k, v),
                })
                .collect();

            // `wine` is resolved from PATH. exe_path is already resolved and
            // is shlex-quoted to survive paths with spaces.
            let quoted_exe = shlex::try_quote(&ctx.launch.exe_path)
                .map(|c| c.into_owned())
                .unwrap_or_else(|_| ctx.launch.exe_path.clone());
            let cmd = format!("wine {quoted_exe}");

            let current_dir = if ctx.launch.current_dir.is_empty() {
                None
            } else {
                Some(ctx.launch.current_dir.clone())
            };

            log::info!(
                "WinePlugin: overriding launch for game {} (prefix={:?}, arch={:?})",
                ctx.launch.game_id,
                config.prefix,
                config.arch
            );

            Ok(Some(StartCtx {
                cmd,
                current_dir,
                env: Some(resolved_env),
            }))
        }
    }

    async fn after_game_exit(&self, ctx: PluginContext) -> Result<()> {
        let PluginConfig::Wine(config) = &*ctx.config else {
            return Ok(());
        };

        #[cfg(target_os = "linux")]
        {
            if !config.kill_wineserver_on_exit {
                return Ok(());
            }

            use crate::db::device::ResolveVar;

            let prefix = {
                let lock = crate::db::CONFIG.lock();
                if config.prefix.is_empty() {
                    String::new()
                } else {
                    lock.varmap().resolve_var(&config.prefix).unwrap_or_default()
                }
            };

            log::info!(
                "WinePlugin: killing wineserver for game {} (prefix={prefix:?})",
                ctx.launch.game_id
            );

            let mut cmd = tokio::process::Command::new("wineserver");
            cmd.arg("-k");
            if !prefix.is_empty() {
                cmd.env("WINEPREFIX", prefix);
            }
            // Best-effort: wineserver -k failing is not fatal.
            if let Err(e) = cmd.status().await {
                log::warn!("WinePlugin: wineserver -k failed: {e}");
            }
        }

        #[cfg(not(target_os = "linux"))]
        {
            let _ = config;
        }

        Ok(())
    }
}

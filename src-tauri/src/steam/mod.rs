//! Steam library integration.
//!
//! Import scans the local Steam library fully offline (libraryfolders.vdf +
//! appmanifest_*.acf via `steamlocate`) — no Web API, no login state, and it
//! is only ever triggered from the import dialog, never while browsing.
//! Launch support lives in `exec`: the `steam://rungameid/{appid}` protocol
//! makes steam.exe (not us) the parent of the game process, so tracking is
//! done by discovering that process and assigning it into the regular Job.
//!
//! Windows-only for now. Native Linux Steam + Proton uses a completely
//! different layout (compatdata prefixes, wine-pids), so the interface is
//! kept platform-neutral but non-Windows stubs return
//! [`SteamError::UnsupportedPlatform`].

#[cfg(windows)]
mod windows;

use std::path::PathBuf;

use serde::Serialize;
use ts_rs::TS;
#[cfg(not(windows))]
pub use unsupported::{list_installed_games, resolve_app_install_dir, resolve_launch_paths};
#[cfg(windows)]
pub use windows::{list_installed_games, resolve_app_install_dir, resolve_launch_paths};

/// Errors surfaced to the frontend as strings; import-specific states that
/// the UI needs to distinguish (Steam not running) travel in
/// [`SteamListResult`] instead.
#[derive(Debug, thiserror::Error)]
pub enum SteamError {
    #[error("Steam client is not running")]
    NotRunning,
    #[error("Steam is not supported on this platform yet")]
    UnsupportedPlatform,
    #[error(
        "Steam game process did not appear within {0} secs (is Steam logged in? is the game still \
         installed?)"
    )]
    LaunchTimeout(u64),
    #[error("Steam library error: {0}")]
    Lib(String),
    #[error("Steam install dir not found for appid {0}")]
    InstallDirNotFound(u32),
}

/// Steam-specific metadata attached to an imported game (`Game::steam`).
///
/// `appid` is the only authoritative identity — the install dir is
/// re-resolved from the live Steam library at every launch (so a relocated
/// library still works); the stored paths are per-device variable-templated
/// snapshots used as fallback.
#[derive(Debug, Clone, Default, Serialize, serde::Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct SteamInfo {
    pub appid: u32,
    /// Absolute path of `steamapps/common/<installdir>`, variable-templated.
    pub install_dir: String,
    /// Heuristic entry-exe guess made at import time; serves as the deploy
    /// target for speedup-style DLL side-loading (`current_dir` derives from
    /// it too). `None` when nothing plausible was found under the install dir.
    pub exe_path: Option<String>,
}

/// One import candidate from the local Steam library.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct SteamGameEntry {
    pub appid: u32,
    pub name: String,
    /// Absolute install path, forward slashes (frontend convention).
    pub install_dir: String,
    pub size_on_disk: Option<u64>,
    /// CDN portrait cover straight into `Game::image_url` (no key, no quota);
    /// downloaded by the existing `prepare_image` pipeline.
    pub cover_url: String,
    pub exe_path: Option<String>,
}

/// Result of the import scan. A non-running Steam client is a state the UI
/// renders explicitly, not an IPC error.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SteamListResult {
    NotRunning,
    // struct variant: internally-tagged serde cannot serialize a newtype
    // variant holding a bare sequence
    Games { games: Vec<SteamGameEntry> },
}

/// Resolved launch-time paths for a Steam game.
#[derive(Debug, Clone)]
pub struct SteamLaunchPaths {
    pub exe_path: String,
    pub current_dir: String,
    /// Install root (`steamapps/common/<installdir>`) — the waiter matches
    /// game processes by exe path prefix against this.
    pub install_dir: PathBuf,
}

#[cfg(not(windows))]
mod unsupported {
    use std::path::PathBuf;

    use super::*;
    use crate::{
        db::Config,
        error::{Error, Result},
    };

    pub fn list_installed_games() -> Result<SteamListResult> {
        Err(Error::Steam(SteamError::UnsupportedPlatform))
    }

    pub fn resolve_app_install_dir(_appid: u32) -> Option<PathBuf> {
        None
    }

    pub fn resolve_launch_paths(
        _lock: &Config,
        _game_name: &str,
        _steam: &SteamInfo,
    ) -> Result<SteamLaunchPaths> {
        Err(Error::Steam(SteamError::UnsupportedPlatform))
    }
}

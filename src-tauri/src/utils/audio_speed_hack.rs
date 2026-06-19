//! Shared utilities for audio DLL injection plugins (VoiceSpeedup,
//! VoiceZerointerrupt).
//!
//! Provides PE architecture detection, DLL extraction from embedded assets,
//! and MMDevAPI COM-redirect registry setup.
//!
//! - **Extraction & architecture detection**: cross-platform (file I/O + goblin
//!   PE parsing).
//! - **Windows registry (HKCU)** + **SPEEDUP env var**: Windows-only.
//! - **Wine registry (regedit)**: Linux-only, drives `wine regedit` against the
//!   game's prefix so the MMDevAPI wrapper is picked up via COM.

use std::{
    fs,
    path::{Path, PathBuf},
};

use include_assets::{NamedArchive, include_dir};
use log::{info, warn};

use crate::{error::Result, plugin::config::SpeedupProvider};

// ── Constants ───

pub const DSOUND_DLL_NAME: &str = "dsound.dll";
pub const SOUNDTOUCH_DLL_NAME: &str = "SoundTouch.dll";
pub const MMDEVAPI_DLL_NAME: &str = "MMDevAPI.dll";
pub const ONNXRUNTIME_DLL_NAME: &str = "onnxruntime.dll";
pub const MODEL_FILE_NAME: &str = "silero_vad.onnx";
pub const SPEEDUP_ENV_NAME: &str = "SPEEDUP";

// ── Architecture

/// Target architecture for DLL selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum System {
    X64,
    X86,
}

impl std::fmt::Display for System {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            System::X64 => write!(f, "x64"),
            System::X86 => write!(f, "x86"),
        }
    }
}

impl System {
    /// Detect PE architecture from an executable file.
    pub fn detect(path: impl AsRef<Path>) -> Result<Self> {
        let buf = fs::read(path)?;
        let pe = goblin::pe::PE::parse(&buf)?;
        if pe.is_64 {
            info!("Detected x64 PE");
            Ok(Self::X64)
        } else {
            info!("Detected x86 PE");
            Ok(Self::X86)
        }
    }
}

// ── Asset extraction helpers (cross-platform) ───────────────────────────────

const BACKUP_SUFFIX: &str = ".backup";

/// Tracks a single extracted file and its optional backup for restoration.
#[derive(Debug)]
pub struct ExtractedFile {
    /// Path of the extracted file in the game directory.
    pub path: PathBuf,
    /// If a pre-existing file was backed up before extraction, this is the
    /// backup path (original renamed to `<name>.backup`).
    pub backup: Option<PathBuf>,
}

/// Extract a single file from a `NamedArchive`.
///
/// If the destination file already exists, it is renamed to `<name>.backup`
/// before extraction so it can be restored during cleanup. The returned
/// `ExtractedFile` always tracks the destination regardless of whether it
/// was newly created or overwritten.
fn extract_single(
    archive: &NamedArchive,
    src_name: &str,
    dest_dir: &Path,
    dest_name: &str,
) -> Result<ExtractedFile> {
    let bytes = archive.get(src_name).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("asset not found: {src_name}"),
        )
    })?;
    let dest = dest_dir.join(dest_name);
    let backup = if dest.exists() {
        let bak = dest_dir.join(format!("{dest_name}{BACKUP_SUFFIX}"));
        fs::rename(&dest, &bak)?;
        info!("Backed up {} -> {}", dest.display(), bak.display());
        Some(bak)
    } else {
        None
    };
    fs::write(&dest, bytes)?;
    info!("Extracted {dest_name}");
    Ok(ExtractedFile { path: dest, backup })
}

pub fn extract_soundtouch(system: System, dest: &Path) -> Result<ExtractedFile> {
    #[cfg(not(debug_assertions))]
    let archive = NamedArchive::load(include_dir!(
        "assets/SoundTouch",
        compression = "zstd",
        level = 22
    ));
    #[cfg(debug_assertions)]
    let archive = NamedArchive::load(include_dir!("assets/SoundTouch"));

    extract_single(
        &archive,
        &format!("SoundTouch-{system}.dll"),
        dest,
        SOUNDTOUCH_DLL_NAME,
    )
}

pub fn extract_dsound_speedup(system: System, dest: &Path) -> Result<ExtractedFile> {
    #[cfg(not(debug_assertions))]
    let archive = NamedArchive::load(include_dir!(
        "assets/dsound",
        compression = "zstd",
        level = 22
    ));
    #[cfg(debug_assertions)]
    let archive = NamedArchive::load(include_dir!("assets/dsound"));

    extract_single(
        &archive,
        &format!("dsound-{system}.dll"),
        dest,
        DSOUND_DLL_NAME,
    )
}

pub fn extract_dsound_zerointerrupt(system: System, dest: &Path) -> Result<ExtractedFile> {
    #[cfg(not(debug_assertions))]
    let archive = NamedArchive::load(include_dir!(
        "assets/dsound",
        compression = "zstd",
        level = 22
    ));
    #[cfg(debug_assertions)]
    let archive = NamedArchive::load(include_dir!("assets/dsound"));

    extract_single(
        &archive,
        &format!("dsound-zerointerrupt-{system}.dll"),
        dest,
        DSOUND_DLL_NAME,
    )
}

pub fn extract_mmdevapi(system: System, dest: &Path) -> Result<ExtractedFile> {
    #[cfg(not(debug_assertions))]
    let archive = NamedArchive::load(include_dir!(
        "assets/MMDevAPI",
        compression = "zstd",
        level = 22
    ));
    #[cfg(debug_assertions)]
    let archive = NamedArchive::load(include_dir!("assets/MMDevAPI"));

    extract_single(
        &archive,
        &format!("MMDevAPI-{system}.dll"),
        dest,
        MMDEVAPI_DLL_NAME,
    )
}

pub fn extract_onnxruntime(system: System, dest: &Path) -> Result<ExtractedFile> {
    #[cfg(not(debug_assertions))]
    let archive = NamedArchive::load(include_dir!(
        "assets/onnxruntime",
        compression = "zstd",
        level = 22
    ));
    #[cfg(debug_assertions)]
    let archive = NamedArchive::load(include_dir!("assets/onnxruntime"));

    extract_single(
        &archive,
        &format!("onnxruntime-{system}.dll"),
        dest,
        ONNXRUNTIME_DLL_NAME,
    )
}

pub fn extract_model(dest: &Path) -> Result<ExtractedFile> {
    #[cfg(not(debug_assertions))]
    let archive = NamedArchive::load(include_dir!(
        "assets/models",
        compression = "zstd",
        level = 22
    ));
    #[cfg(debug_assertions)]
    let archive = NamedArchive::load(include_dir!("assets/models"));

    extract_single(&archive, "silero_vad.onnx", dest, MODEL_FILE_NAME)
}

/// Extract all DLLs needed for VoiceSpeedup based on the chosen provider.
pub fn extract_speedup_assets(
    system: System,
    dest: &Path,
    provider: SpeedupProvider,
) -> Result<Vec<ExtractedFile>> {
    let mut files = Vec::new();

    let result: Result<()> = (|| {
        match provider {
            SpeedupProvider::DSound => {
                files.push(extract_soundtouch(system, dest)?);
                files.push(extract_dsound_speedup(system, dest)?);
            }
            SpeedupProvider::MMDevAPI => {
                files.push(extract_soundtouch(system, dest)?);
                files.push(extract_mmdevapi(system, dest)?);
            }
        }
        Ok(())
    })();

    // 如果中途解压失败，清理掉已经解压出来的部分文件
    if let Err(e) = result {
        cleanup_files(&files);
        return Err(e);
    }
    Ok(files)
}

/// Extract all DLLs needed for VoiceZerointerrupt.
pub fn extract_zerointerrupt_assets(system: System, dest: &Path) -> Result<Vec<ExtractedFile>> {
    let mut files = Vec::new();

    let result: Result<()> = (|| {
        files.push(extract_dsound_zerointerrupt(system, dest)?);
        files.push(extract_model(dest)?);
        files.push(extract_onnxruntime(system, dest)?);
        Ok(())
    })();

    if let Err(e) = result {
        cleanup_files(&files);
        return Err(e);
    }
    Ok(files)
}

/// Remove extracted files and restore any backups.
pub fn cleanup_files(files: &[ExtractedFile]) {
    for file in files {
        // 1. Remove the extracted file
        match fs::remove_file(&file.path) {
            Ok(()) => info!("Cleaned up: {}", file.path.display()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                warn!("File not found during cleanup: {}", file.path.display());
            }
            Err(e) => {
                log::error!("Failed to remove {}: {e}", file.path.display());
            }
        }
        // 2. Restore backup if one exists
        if let Some(backup) = &file.backup {
            match fs::rename(backup, &file.path) {
                Ok(()) => info!(
                    "Restored backup: {} -> {}",
                    backup.display(),
                    file.path.display()
                ),
                Err(e) => {
                    log::error!("Failed to restore backup {}: {e}", backup.display());
                }
            }
        }
    }
}

// ── MMDevAPI COM redirect data (cross-platform) ─────────────────────────────

/// A single MMDevAPI COM `InprocServer32` redirect entry, stored as plain data
/// so both the Windows and Wine executors can drive off the same table.
struct MmdevapiRegItem {
    /// Registry path relative to `HKEY_CURRENT_USER`, with backslashes.
    path: &'static str,
    /// `ThreadingModel` value.
    threading_model: &'static str,
}

/// All 8 CLSID redirect entries (4 CLSIDs × {64-bit, WOW6432Node}).
const MMDEVAPI_REG_ITEMS: &[MmdevapiRegItem] = &[
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\CLSID\{06CCA63E-9941-441B-B004-39F999ADA412}\InprocServer32",
        threading_model: "both",
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\CLSID\{93C063B0-68CB-4DE7-B032-8F56C1D2E99D}\InprocServer32",
        threading_model: "both",
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\CLSID\{BCDE0395-E52F-467C-8E3D-C4579291692E}\InprocServer32",
        threading_model: "both",
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\CLSID\{E2F7A62A-862B-40AE-BBC2-5C0CA9A5B7E1}\InprocServer32",
        threading_model: "free",
    },
    // WOW6432Node entries (32-bit view)
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\WOW6432Node\CLSID\{06CCA63E-9941-441B-B004-39F999ADA412}\InprocServer32",
        threading_model: "both",
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\WOW6432Node\CLSID\{93C063B0-68CB-4DE7-B032-8F56C1D2E99D}\InprocServer32",
        threading_model: "both",
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\WOW6432Node\CLSID\{BCDE0395-E52F-467C-8E3D-C4579291692E}\InprocServer32",
        threading_model: "both",
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\WOW6432Node\CLSID\{E2F7A62A-862B-40AE-BBC2-5C0CA9A5B7E1}\InprocServer32",
        threading_model: "free",
    },
];

// ── Windows registry + env (Windows-only) ───────────────────────────────────

#[cfg(windows)]
mod win_impl {
    use windows_registry_obj::{BaseKey, RegValueData};

    use super::{MMDEVAPI_DLL_NAME, MMDEVAPI_REG_ITEMS, SPEEDUP_ENV_NAME};
    use crate::error::Result;

    /// Add MMDevAPI registry entries (for MMDevAPI DLL injection).
    pub fn set_mmdevapi_registry() -> std::io::Result<()> {
        for item in MMDEVAPI_REG_ITEMS {
            BaseKey::CurrentUser
                .reg(item.path)
                .with_values([
                    ("", RegValueData::ExpandableString(MMDEVAPI_DLL_NAME.into())),
                    (
                        "ThreadingModel",
                        RegValueData::String(item.threading_model.into()),
                    ),
                ])
                .set()?;
            log::info!("Registry created: HKCU\\{}", item.path);
        }
        Ok(())
    }

    /// Remove MMDevAPI registry entries.
    pub fn clean_mmdevapi_registry() {
        for item in MMDEVAPI_REG_ITEMS {
            let reg = BaseKey::CurrentUser.reg(item.path);
            match reg.remove_registry() {
                Ok(()) => log::info!("Registry removed: HKCU\\{}", item.path),
                Err(e) => log::warn!("Failed to remove registry HKCU\\{}: {e}", item.path),
            }
        }
    }

    // ── Environment variable ──

    /// Set the SPEEDUP environment variable to the given speed value.
    pub fn set_speedup_env(speed: f32) -> Result<()> {
        windows_env::set(SPEEDUP_ENV_NAME, format!("{speed:.1}"))?;
        log::info!("Set env {SPEEDUP_ENV_NAME}={speed:.1}");
        Ok(())
    }

    /// Remove the SPEEDUP environment variable.
    pub fn remove_speedup_env() {
        if let Err(e) = windows_env::remove(SPEEDUP_ENV_NAME) {
            log::warn!("Failed to remove env {SPEEDUP_ENV_NAME}: {e}");
        }
    }
}

#[cfg(windows)]
pub use win_impl::{
    clean_mmdevapi_registry, remove_speedup_env, set_mmdevapi_registry, set_speedup_env,
};

// ── Wine registry (Linux-only) ──────────────────────────────────────────────
//
// On Linux the audio DLLs run inside Wine, so the MMDevAPI COM redirect has to
// land in the *prefix*'s registry. We emit a `.reg` file and import it via
// `wine regedit /S` against the game's `WINEPREFIX`.
//
// These functions are synchronous (std::process) so they can run both from an
// async hook (wrapped in `spawn_blocking`) and from a sync `Transaction`
// cleanup closure.

#[cfg(target_os = "linux")]
mod wine_regedit {
    use std::{
        fs, io,
        path::PathBuf,
        process::{Command, Stdio},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{MMDEVAPI_DLL_NAME, MMDEVAPI_REG_ITEMS};

    /// Build a `REGEDIT4` file body. When `delete` is true each key is prefixed
    /// with `-`, which regedit interprets as "delete this key".
    fn build_reg_file(delete: bool) -> String {
        let mut s = String::from("REGEDIT4\r\n\r\n");
        for item in MMDEVAPI_REG_ITEMS {
            if delete {
                s.push_str(&format!("[-HKEY_CURRENT_USER\\{}]\r\n\r\n", item.path));
            } else {
                s.push_str(&format!(
                    "[HKEY_CURRENT_USER\\{}]\r\n@=\"{MMDEVAPI_DLL_NAME}\"\r\n\"ThreadingModel\"=\"{}\"\r\n\r\n",
                    item.path, item.threading_model
                ));
            }
        }
        s
    }

    fn unique_reg_path(tag: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let mut p = std::env::temp_dir();
        p.push(format!("ggmm-{tag}-{nonce}.reg"));
        p
    }

    /// Write `content` to a temp `.reg` file and import it with
    /// `wine regedit /S`. `prefix` overrides `WINEPREFIX`.
    fn run_regedit(tag: &str, prefix: Option<&str>, content: &str) -> io::Result<()> {
        let path = unique_reg_path(tag);
        fs::write(&path, content)?;

        let mut cmd = Command::new("wine");
        cmd.args(["regedit", "/S"]).arg(&path);
        if let Some(p) = prefix {
            cmd.env("WINEPREFIX", p);
        }
        // Discard wine's stdout/stderr (prefix-init noise) to avoid pipe stalls.
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());

        let status_result = cmd.status();
        // Always clean up the temp file, even on error.
        let _ = fs::remove_file(&path);
        let status = status_result?;
        if !status.success() {
            return Err(io::Error::other(format!(
                "wine regedit exited with {status}"
            )));
        }
        Ok(())
    }

    /// Add MMDevAPI registry entries to the Wine prefix.
    pub fn set_mmdevapi_registry(prefix: Option<&str>) -> io::Result<()> {
        let content = build_reg_file(false);
        run_regedit("mmdevapi-set", prefix, &content)?;
        log::info!(
            "Wine MMDevAPI registry set ({} entries)",
            MMDEVAPI_REG_ITEMS.len()
        );
        Ok(())
    }

    /// Remove MMDevAPI registry entries from the Wine prefix. Best-effort.
    pub fn clean_mmdevapi_registry(prefix: Option<&str>) {
        let content = build_reg_file(true);
        match run_regedit("mmdevapi-del", prefix, &content) {
            Ok(()) => log::info!("Wine MMDevAPI registry cleaned"),
            Err(e) => log::warn!("Failed to clean wine MMDevAPI registry: {e}"),
        }
    }
}

#[cfg(target_os = "linux")]
pub use wine_regedit::{clean_mmdevapi_registry, set_mmdevapi_registry};

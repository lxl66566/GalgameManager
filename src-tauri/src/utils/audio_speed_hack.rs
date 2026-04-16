//! Shared utilities for audio DLL injection plugins (VoiceSpeedup,
//! VoiceZerointerrupt).
//!
//! Provides PE architecture detection, DLL extraction from embedded assets,
//! Windows registry manipulation for MMDevAPI, and SPEEDUP environment
//! variable management.
//!
//! This entire module is **Windows-only** and is gated by `#[cfg(windows)]`
//! in `mod.rs`.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::LazyLock as Lazy,
};

use include_assets::{NamedArchive, include_dir};
use log::{info, warn};
use windows_registry_obj::{BaseKey, RegValueData, Registry};

use crate::{error::Result, plugin::config::SpeedupProvider};

// ── Constants ──────────────────────────────────────────────────────────────

pub const DSOUND_DLL_NAME: &str = "dsound.dll";
pub const SOUNDTOUCH_DLL_NAME: &str = "SoundTouch.dll";
pub const MMDEVAPI_DLL_NAME: &str = "MMDevAPI.dll";
pub const ONNXRUNTIME_DLL_NAME: &str = "onnxruntime.dll";
pub const MODEL_FILE_NAME: &str = "silero_vad.onnx";
pub const SPEEDUP_ENV_NAME: &str = "SPEEDUP";

// ── Architecture ───────────────────────────────────────────────────────────

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

// ── Asset extraction helpers ───────────────────────────────────────────────

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

// ── Registry ───────────────────────────────────────────────────────────────

static MMDEVAPI_REGISTRY_ITEMS: Lazy<Vec<Registry<'static>>> = Lazy::new(|| {
    [
        BaseKey::CurrentUser
            .reg("SOFTWARE\\Classes\\CLSID\\{06CCA63E-9941-441B-B004-39F999ADA412}\\InprocServer32")
            .with_values([
                ("", RegValueData::ExpandableString(MMDEVAPI_DLL_NAME.into())),
                ("ThreadingModel", RegValueData::String("both".into())),
            ]),
        BaseKey::CurrentUser
            .reg("SOFTWARE\\Classes\\CLSID\\{93C063B0-68CB-4DE7-B032-8F56C1D2E99D}\\InprocServer32")
            .with_values([
                ("", RegValueData::ExpandableString(MMDEVAPI_DLL_NAME.into())),
                ("ThreadingModel", RegValueData::String("both".into())),
            ]),
        BaseKey::CurrentUser
            .reg("SOFTWARE\\Classes\\CLSID\\{BCDE0395-E52F-467C-8E3D-C4579291692E}\\InprocServer32")
            .with_values([
                ("", RegValueData::ExpandableString(MMDEVAPI_DLL_NAME.into())),
                ("ThreadingModel", RegValueData::String("both".into())),
            ]),
        BaseKey::CurrentUser
            .reg("SOFTWARE\\Classes\\CLSID\\{E2F7A62A-862B-40AE-BBC2-5C0CA9A5B7E1}\\InprocServer32")
            .with_values([
                ("", RegValueData::ExpandableString(MMDEVAPI_DLL_NAME.into())),
                ("ThreadingModel", RegValueData::String("free".into())),
            ]),
        // WOW6432Node Entries
        BaseKey::CurrentUser
            .reg("SOFTWARE\\Classes\\WOW6432Node\\CLSID\\{06CCA63E-9941-441B-B004-39F999ADA412}\\InprocServer32")
            .with_values([
                ("", RegValueData::ExpandableString(MMDEVAPI_DLL_NAME.into())),
                ("ThreadingModel", RegValueData::String("both".into())),
            ]),
        BaseKey::CurrentUser
            .reg("SOFTWARE\\Classes\\WOW6432Node\\CLSID\\{93C063B0-68CB-4DE7-B032-8F56C1D2E99D}\\InprocServer32")
            .with_values([
                ("", RegValueData::ExpandableString(MMDEVAPI_DLL_NAME.into())),
                ("ThreadingModel", RegValueData::String("both".into())),
            ]),
        BaseKey::CurrentUser
            .reg("SOFTWARE\\Classes\\WOW6432Node\\CLSID\\{BCDE0395-E52F-467C-8E3D-C4579291692E}\\InprocServer32")
            .with_values([
                ("", RegValueData::ExpandableString(MMDEVAPI_DLL_NAME.into())),
                ("ThreadingModel", RegValueData::String("both".into())),
            ]),
        BaseKey::CurrentUser
            .reg("SOFTWARE\\Classes\\WOW6432Node\\CLSID\\{E2F7A62A-862B-40AE-BBC2-5C0CA9A5B7E1}\\InprocServer32")
            .with_values([
                ("", RegValueData::ExpandableString(MMDEVAPI_DLL_NAME.into())),
                ("ThreadingModel", RegValueData::String("free".into())),
            ]),
    ]
    .to_vec()
});

/// Add MMDevAPI registry entries (for MMDevAPI DLL injection).
pub fn set_mmdevapi_registry() -> std::io::Result<()> {
    for item in MMDEVAPI_REGISTRY_ITEMS.iter() {
        item.set()?;
        info!("Registry created: {:?}", item.full_path());
    }
    Ok(())
}

/// Remove MMDevAPI registry entries.
pub fn clean_mmdevapi_registry() {
    for item in MMDEVAPI_REGISTRY_ITEMS.iter() {
        match item.remove_registry() {
            Ok(()) => info!("Registry removed: {:?}", item.full_path()),
            Err(e) => warn!("Failed to remove registry {:?}: {e}", item.full_path()),
        }
    }
}

// ── Environment variable ───────────────────────────────────────────────────

/// Set the SPEEDUP environment variable to the given speed value.
pub fn set_speedup_env(speed: f32) -> Result<()> {
    windows_env::set(SPEEDUP_ENV_NAME, format!("{speed:.1}"))?;
    info!("Set env {SPEEDUP_ENV_NAME}={speed:.1}");
    Ok(())
}

/// Remove the SPEEDUP environment variable.
pub fn remove_speedup_env() {
    if let Err(e) = windows_env::remove(SPEEDUP_ENV_NAME) {
        warn!("Failed to remove env {SPEEDUP_ENV_NAME}: {e}");
    }
}

//! Shared utilities for audio DLL injection plugins (VoiceSpeedup,
//! VoiceZerointerrupt).
//!
//! Provides PE architecture detection, DLL extraction from embedded assets,
//! and MMDevAPI COM-redirect registry setup.
//!
//! - **Extraction & architecture detection**: cross-platform (file I/O + goblin PE parsing).
//! - **Windows registry (HKCU)** + **SPEEDUP env var**: Windows-only.
//! - **Wine registry (regedit)**: Linux-only, drives `wine regedit` against the game's prefix so
//!   the MMDevAPI wrapper is picked up via COM.

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

/// File name of the MMDevAPI COM forwarding stub for an architecture.
#[must_use]
pub fn mmdevapi_stub_name(system: System) -> String {
    format!("MMDevAPI-stub-{system}.dll")
}

/// Extract the MMDevAPI COM forwarding stubs (both architectures) to `dest`,
/// overwriting any previous version.
///
/// The COM registry references these by absolute path: a bare `MMDevAPI.dll`
/// value fails to resolve inside games that restrict the DLL search order
/// (SetDefaultDllDirectories & co.), which makes the engine give up on audio
/// entirely. The stub forwards DGCO either to a game-dir proxy or to the real
/// system DLL, so it is pass-through for every other process — therefore the
/// stubs are deliberately NOT tracked for cleanup after the game exits.
pub fn extract_mmdevapi_stubs(dest: &Path) -> Result<()> {
    #[cfg(not(debug_assertions))]
    let archive = NamedArchive::load(include_dir!(
        "assets/MMDevAPI",
        compression = "zstd",
        level = 22
    ));
    #[cfg(debug_assertions)]
    let archive = NamedArchive::load(include_dir!("assets/MMDevAPI"));

    for system in [System::X64, System::X86] {
        let name = mmdevapi_stub_name(system);
        let bytes = archive.get(&name).ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("asset not found: {name}"),
            )
        })?;
        let dest_file = dest.join(&name);
        if let Err(e) = fs::write(&dest_file, bytes) {
            if !dest_file.exists() {
                return Err(e.into());
            }
            // Locked by a running game: the old stub still serves the
            // registry path, keep it.
            warn!(
                "Stub {} busy, keeping existing copy: {e}",
                dest_file.display()
            );
        }
        info!("Deployed stub {}", dest_file.display());
    }
    Ok(())
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
            },
            SpeedupProvider::MMDevAPI => {
                files.push(extract_soundtouch(system, dest)?);
                files.push(extract_mmdevapi(system, dest)?);
            },
        }
        Ok(())
    })();

    // Clean up partially extracted files if any step fails midway
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
            },
            Err(e) => {
                log::error!("Failed to remove {}: {e}", file.path.display());
            },
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
                },
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
    /// Which stub architecture this view serves: 64-bit view → x64 stub,
    /// WOW6432Node view → x86 stub (32-bit COM clients).
    stub: System,
}

/// All 8 CLSID redirect entries (4 CLSIDs × {64-bit, WOW6432Node}).
const MMDEVAPI_REG_ITEMS: &[MmdevapiRegItem] = &[
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\CLSID\{06CCA63E-9941-441B-B004-39F999ADA412}\InprocServer32",
        threading_model: "both",
        stub: System::X64,
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\CLSID\{93C063B0-68CB-4DE7-B032-8F56C1D2E99D}\InprocServer32",
        threading_model: "both",
        stub: System::X64,
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\CLSID\{BCDE0395-E52F-467C-8E3D-C4579291692E}\InprocServer32",
        threading_model: "both",
        stub: System::X64,
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\CLSID\{E2F7A62A-862B-40AE-BBC2-5C0CA9A5B7E1}\InprocServer32",
        threading_model: "free",
        stub: System::X64,
    },
    // WOW6432Node entries (32-bit view)
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\WOW6432Node\CLSID\{06CCA63E-9941-441B-B004-39F999ADA412}\InprocServer32",
        threading_model: "both",
        stub: System::X86,
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\WOW6432Node\CLSID\{93C063B0-68CB-4DE7-B032-8F56C1D2E99D}\InprocServer32",
        threading_model: "both",
        stub: System::X86,
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\WOW6432Node\CLSID\{BCDE0395-E52F-467C-8E3D-C4579291692E}\InprocServer32",
        threading_model: "both",
        stub: System::X86,
    },
    MmdevapiRegItem {
        path: r"SOFTWARE\Classes\WOW6432Node\CLSID\{E2F7A62A-862B-40AE-BBC2-5C0CA9A5B7E1}\InprocServer32",
        threading_model: "free",
        stub: System::X86,
    },
];

// ── Windows registry + env (Windows-only) ───────────────────────────────────

#[cfg(windows)]
mod win_impl {
    use std::{
        fs, io,
        path::{Path, PathBuf},
        sync::atomic::{AtomicUsize, Ordering},
    };

    use windows_registry_obj::{BaseKey, RegValueData};

    use super::{MMDEVAPI_REG_ITEMS, SPEEDUP_ENV_NAME};
    use crate::{db::CONFIG_DIR, error::Result};

    /// Add MMDevAPI registry entries (for MMDevAPI DLL injection).
    ///
    /// The entries point at the COM forwarding stub's absolute path (a bare
    /// `MMDevAPI.dll` value fails to resolve in games that restrict the DLL
    /// search order), so the stub is (re)deployed to `stub_dir` (the app's
    /// local data dir) first. Stubs are pass-through for non-game processes
    /// and outlive the game session.
    pub fn set_mmdevapi_registry(stub_dir: &Path) -> io::Result<()> {
        super::extract_mmdevapi_stubs(stub_dir).map_err(io::Error::other)?;
        acquire_session_marker();
        for item in MMDEVAPI_REG_ITEMS {
            let stub = stub_dir.join(super::mmdevapi_stub_name(item.stub));
            BaseKey::CurrentUser
                .reg(item.path)
                .with_values([
                    (
                        "",
                        RegValueData::ExpandableString(stub.to_string_lossy().into_owned().into()),
                    ),
                    (
                        "ThreadingModel",
                        RegValueData::String(item.threading_model.into()),
                    ),
                ])
                .set()
                .map_err(io::Error::other)?;
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
        release_session_marker();
    }

    // ── Environment variable ──

    /// Set the SPEEDUP environment variable to the given speed value.
    pub fn set_speedup_env(speed: f32) -> Result<()> {
        acquire_session_marker();
        windows_env::set(SPEEDUP_ENV_NAME, format!("{speed:.1}")).map_err(io::Error::from)?;
        log::info!("Set env {SPEEDUP_ENV_NAME}={speed:.1}");
        Ok(())
    }

    /// Update SPEEDUP for a session already tracked by a launch-time
    /// [`set_speedup_env`]. Deliberately skips the session marker: the launch
    /// still owns its acquire, and a second one would strand the counter
    /// above zero (marker file leaked → false crash-residue cleanup at the
    /// next startup).
    pub fn update_speedup_env(speed: f32) -> Result<()> {
        windows_env::set(SPEEDUP_ENV_NAME, format!("{speed:.1}")).map_err(io::Error::from)?;
        log::info!("Updated env {SPEEDUP_ENV_NAME}={speed:.1}");
        Ok(())
    }

    /// Remove the SPEEDUP environment variable.
    pub fn remove_speedup_env() {
        if let Err(e) = windows_env::remove(SPEEDUP_ENV_NAME) {
            log::warn!("Failed to remove env {SPEEDUP_ENV_NAME}: {e}");
        }
        release_session_marker();
    }

    // ── Crash-residue detection ──
    //
    // The SPEEDUP env var (HKCU\Environment) and the MMDevAPI COM redirect
    // (HKCU\SOFTWARE\Classes\CLSID\...) are *persistent* user-level
    // mutations. Normally the launch Transaction removes them, but a crash /
    // force-kill skips those cleanups and the residue would affect every
    // process started afterwards. (The COM redirect points at the forwarding
    // stub, which passes through to the system DLL for processes without a
    // game-dir proxy — the residue is behaviorally harmless but still
    // removed. The stub files themselves are left in place.) While at least
    // one speedup session is active we keep a marker file holding our PID; it
    // is deleted when the last session's cleanup runs. A marker still present
    // at the next startup means the previous instance died mid-session — the
    // single-instance plugin guarantees that process is gone by the time we
    // run — so the residue is ours and safe to remove.

    static ACTIVE_SESSIONS: AtomicUsize = AtomicUsize::new(0);

    fn session_marker_path() -> PathBuf {
        CONFIG_DIR.join("speedup_session")
    }

    fn write_session_marker(path: &Path, pid: u32) -> io::Result<()> {
        fs::write(path, pid.to_string())
    }

    /// A marker only counts as crash residue when it was written by a
    /// *different* process (our own marker legitimately exists mid-session;
    /// at startup the PIDs can never match — this is belt and braces). A
    /// marker whose PID can't be parsed proves nothing, so it is treated as
    /// residue too: the file is only ever created by this app.
    fn is_crash_residue(path: &Path, current_pid: u32) -> bool {
        let Ok(content) = fs::read_to_string(path) else {
            return false;
        };
        content.trim().parse::<u32>() != Ok(current_pid)
    }

    /// Track one more in-flight persistent mutation (0→1 writes the marker).
    fn acquire_session_marker() {
        if ACTIVE_SESSIONS.fetch_add(1, Ordering::AcqRel) == 0 {
            let path = session_marker_path();
            if let Err(e) = write_session_marker(&path, std::process::id()) {
                log::warn!(
                    "Failed to write speedup session marker {}: {e}",
                    path.display()
                );
            }
        }
    }

    /// Track one finished cleanup (1→0 deletes the marker). Saturating: a
    /// cleanup may run without a matching acquire when the corresponding
    /// `set_*` failed halfway.
    fn release_session_marker() {
        // Saturating decrement via CAS loop (cleanup may run without a
        // matching acquire when the corresponding `set_*` failed halfway).
        // Written by hand because `AtomicUsize::fetch_update` is deprecated
        // and its replacement `try_update` exceeds our MSRV.
        let mut prev = ACTIVE_SESSIONS.load(Ordering::Acquire);
        loop {
            if prev == 0 {
                return;
            }
            match ACTIVE_SESSIONS.compare_exchange_weak(
                prev,
                prev - 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => break,
                Err(p) => prev = p,
            }
        }
        if prev == 1 {
            let path = session_marker_path();
            if let Err(e) = fs::remove_file(&path) {
                log::warn!(
                    "Failed to remove speedup session marker {}: {e}",
                    path.display()
                );
            }
        }
    }

    /// Remove leftover speedup residue from a crashed/killed previous
    /// instance. Must run at startup, before any new speedup session begins.
    pub fn cleanup_crashed_session() {
        let path = session_marker_path();
        if !is_crash_residue(&path, std::process::id()) {
            return;
        }
        log::warn!("Found speedup residue from a crashed session; cleaning up");
        remove_speedup_env();
        clean_mmdevapi_registry();
        if let Err(e) = fs::remove_file(&path) {
            log::warn!(
                "Failed to remove speedup session marker {}: {e}",
                path.display()
            );
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn marker_residue_detection() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("speedup_session");

            // No marker → nothing to clean.
            assert!(!is_crash_residue(&path, 1234));

            // Marker from another (dead) process → residue.
            write_session_marker(&path, 4242).unwrap();
            assert!(is_crash_residue(&path, 1234));
            // Our own live marker → not residue.
            assert!(!is_crash_residue(&path, 4242));

            // Unparseable marker can't prove ownership → treat as residue.
            fs::write(&path, b"not a pid").unwrap();
            assert!(is_crash_residue(&path, 4242));
        }
    }
}

#[cfg(windows)]
pub use win_impl::{
    clean_mmdevapi_registry, cleanup_crashed_session, remove_speedup_env, set_mmdevapi_registry,
    set_speedup_env, update_speedup_env,
};

/// No-op outside Windows: the persistent HKCU residue only exists there.
/// (On Linux the MMDevAPI redirect lives inside the per-game Wine prefix,
/// where leftover entries are harmless until that prefix is reused.)
#[cfg(not(windows))]
pub fn cleanup_crashed_session() {}

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
        fmt::Write as _,
        fs, io,
        path::PathBuf,
        process::{Command, Stdio},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{MMDEVAPI_REG_ITEMS, SPEEDUP_ENV_NAME, System, mmdevapi_stub_name};

    /// Resolve the host-side `drive_c` directory of a Wine prefix.
    fn prefix_drive_c(prefix: Option<&str>) -> PathBuf {
        let base = match prefix {
            Some(p) => PathBuf::from(p),
            // wine's default prefix is $HOME/.wine
            None => home::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".wine"),
        };
        base.join("drive_c")
    }

    /// Build a `REGEDIT4` file body. When `delete` is true each key is prefixed
    /// with `-`, which regedit interprets as "delete this key". The non-delete
    /// form points each view at its matching stub via an absolute `C:\` path.
    fn build_reg_file(delete: bool, stub_x64: &str, stub_x86: &str) -> String {
        let mut s = String::from("REGEDIT4\r\n\r\n");
        for item in MMDEVAPI_REG_ITEMS {
            if delete {
                let _ = write!(s, "[-HKEY_CURRENT_USER\\{}]\r\n\r\n", item.path);
            } else {
                let dll = if item.stub == System::X64 {
                    stub_x64
                } else {
                    stub_x86
                };
                let _ = write!(
                    s,
                    "[HKEY_CURRENT_USER\\{}]\r\n@=\"{dll}\"\r\n\"ThreadingModel\"=\"{}\"\r\n\r\n",
                    item.path, item.threading_model
                );
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
    ///
    /// The forwarding stubs are (re)deployed to the prefix's `C:\` root
    /// first; the registry then references them by absolute path — a bare
    /// `MMDevAPI.dll` value fails to resolve in games that restrict the DLL
    /// search order. Stubs are pass-through and are never removed afterwards.
    pub fn set_mmdevapi_registry(prefix: Option<&str>) -> io::Result<()> {
        let drive_c = prefix_drive_c(prefix);
        fs::create_dir_all(&drive_c)?;
        super::extract_mmdevapi_stubs(&drive_c).map_err(io::Error::other)?;
        let stub_x64 = windows_drive_path(System::X64);
        let stub_x86 = windows_drive_path(System::X86);
        let content = build_reg_file(false, &stub_x64, &stub_x86);
        run_regedit("mmdevapi-set", prefix, &content)?;
        log::info!(
            "Wine MMDevAPI registry set ({} entries)",
            MMDEVAPI_REG_ITEMS.len()
        );
        Ok(())
    }

    /// Wine-visible absolute path of a stub deployed at the prefix drive_c root.
    fn windows_drive_path(system: System) -> String {
        format!("C:\\{}", mmdevapi_stub_name(system))
    }

    /// Remove MMDevAPI registry entries from the Wine prefix. Best-effort.
    pub fn clean_mmdevapi_registry(prefix: Option<&str>) {
        let content = build_reg_file(true, "", "");
        match run_regedit("mmdevapi-del", prefix, &content) {
            Ok(()) => log::info!("Wine MMDevAPI registry cleaned"),
            Err(e) => log::warn!("Failed to clean wine MMDevAPI registry: {e}"),
        }
    }

    // ── SPEEDUP env in the prefix registry ──
    //
    // The injected DLL reads SPEEDUP from `HKCU\Environment` via the registry
    // API (on Windows `windows_env::set` targets the same key). Under Wine
    // that key lives in the prefix registry, so the value is mirrored there
    // for both launch (alongside the process-env overlay) and live updates.

    /// Build a `REGEDIT4` body setting SPEEDUP in `HKCU\Environment`.
    fn build_speedup_env_reg(speed: f32) -> String {
        format!(
            "REGEDIT4\r\n\r\n[HKEY_CURRENT_USER\\Environment]\r\n\"{SPEEDUP_ENV_NAME}\"=\"{speed:.\
             1}\"\r\n"
        )
    }

    /// Build a `REGEDIT4` body deleting only the SPEEDUP *value*. Must not use
    /// the `[-HKEY...]` key-deletion form: the Environment key also holds the
    /// user's other variables.
    fn build_speedup_env_delete_reg() -> String {
        format!("REGEDIT4\r\n\r\n[HKEY_CURRENT_USER\\Environment]\r\n\"{SPEEDUP_ENV_NAME}\"=-\r\n")
    }

    /// Set SPEEDUP in the prefix's `HKCU\Environment`.
    pub fn set_speedup_env_registry(prefix: Option<&str>, speed: f32) -> io::Result<()> {
        run_regedit("speedup-env-set", prefix, &build_speedup_env_reg(speed))?;
        log::info!("Wine env {SPEEDUP_ENV_NAME}={speed:.1} set in prefix registry");
        Ok(())
    }

    /// Remove SPEEDUP from the prefix's `HKCU\Environment`. Best-effort.
    pub fn clean_speedup_env_registry(prefix: Option<&str>) {
        match run_regedit("speedup-env-del", prefix, &build_speedup_env_delete_reg()) {
            Ok(()) => log::info!("Wine env {SPEEDUP_ENV_NAME} removed from prefix registry"),
            Err(e) => log::warn!("Failed to remove wine env {SPEEDUP_ENV_NAME}: {e}"),
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn speedup_env_reg_sets_value_in_environment_key() {
            let reg = build_speedup_env_reg(1.5);
            assert!(reg.contains("[HKEY_CURRENT_USER\\Environment]"));
            assert!(reg.contains("\"SPEEDUP\"=\"1.5\""));
        }

        #[test]
        fn speedup_env_reg_delete_targets_value_not_key() {
            let reg = build_speedup_env_delete_reg();
            // Value deletion only; deleting the whole key would wipe the
            // user's other environment variables.
            assert!(reg.contains("\"SPEEDUP\"=-"));
            assert!(!reg.contains("[-HKEY_CURRENT_USER\\Environment]"));
        }
    }
}

#[cfg(target_os = "linux")]
pub use wine_regedit::{
    clean_mmdevapi_registry, clean_speedup_env_registry, set_mmdevapi_registry,
    set_speedup_env_registry,
};

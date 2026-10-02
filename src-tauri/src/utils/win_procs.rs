//! Windows process enumeration helpers (Toolhelp32 snapshot + full image
//! path query). Shared by the Steam launch waiter (game-process discovery)
//! and the "is the Steam client running" check.

use std::path::{Path, PathBuf};

use windows::{
    Win32::{
        Foundation::CloseHandle,
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
                TH32CS_SNAPPROCESS,
            },
            Threading::{
                OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
                QueryFullProcessImageNameW,
            },
        },
    },
    core::PWSTR,
};

/// One process entry from a Toolhelp snapshot.
pub struct ProcessInfo {
    pub pid: u32,
    /// exe file name only (no dir), original casing.
    pub exe_name: String,
}

/// Snapshot all processes. Returns an empty vec if the snapshot itself
/// fails — callers treat "cannot enumerate" as "nothing found yet".
#[must_use]
pub fn snapshot_processes() -> Vec<ProcessInfo> {
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        let mut entry = PROCESSENTRY32W {
            // Struct size always fits in u32.
            #[allow(clippy::cast_possible_truncation)]
            dwSize: size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snap, &raw mut entry).is_ok() {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(0);
                out.push(ProcessInfo {
                    pid: entry.th32ProcessID,
                    exe_name: String::from_utf16_lossy(&entry.szExeFile[..len]),
                });
                if Process32NextW(snap, &raw mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        out
    }
}

/// Full executable path of a running process, `None` when it cannot be
/// opened (already exited, elevated/system process).
#[must_use]
pub fn process_image_path(pid: u32) -> Option<PathBuf> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = u32::try_from(buf.len()).ok()?;
        // PROCESS_NAME_WIN32: plain Win32 path, no `\\?\` prefix
        let res = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &raw mut len,
        );
        let _ = CloseHandle(handle);
        res.ok()?;
        Some(PathBuf::from(String::from_utf16_lossy(
            &buf[..len as usize],
        )))
    }
}

/// Whether a process with the given exe file name is running
/// (case-insensitive, e.g. "steam.exe").
#[must_use]
pub fn is_process_running(exe_name: &str) -> bool {
    snapshot_processes()
        .iter()
        .any(|p| p.exe_name.eq_ignore_ascii_case(exe_name))
}

/// Case-insensitive, separator-insensitive directory-prefix test (Windows
/// filesystem semantics). Requires a component boundary after the prefix so
/// `D:\Games\Foo` does not match `D:\Games\Foo2`.
#[must_use]
pub fn path_is_under(child: &Path, parent: &Path) -> bool {
    let norm = |p: &Path| {
        p.to_string_lossy()
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_ascii_lowercase()
    };
    let c = norm(child);
    let p = norm(parent);
    if p.is_empty() {
        return false;
    }
    c.starts_with(&p) && c.as_bytes().get(p.len()) == Some(&b'\\')
}

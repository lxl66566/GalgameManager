use std::{
    cmp::Reverse,
    path::{Path, PathBuf},
};

use log::{info, warn};
use steamlocate::{App, SteamDir, app::StateFlag};

use super::{SteamError, SteamGameEntry, SteamInfo, SteamLaunchPaths, SteamListResult};
use crate::{
    db::Config,
    error::{Error, Result},
    utils::win_procs,
};

/// Steam "apps" that are not games (redistributable bundles etc).
/// appmanifests carry no app-type field, so known tools are filtered by id;
/// Steamworks Common Redistributables exists under two appids (legacy +
/// current) and is double-guarded by exact name, since more tool-type
/// entries keep appearing and ids alone are a moving target.
const NON_GAME_APPIDS: &[u32] = &[228983, 2289838];
const NON_GAME_NAMES: &[&str] = &["steamworks common redistributables"];

/// Subdirectory names (lowercase) that never contain the game exe — only
/// redistributables and support tooling.
const REDIST_DIRS: &[&str] = &[
    "__support",
    "3rdparty",
    "crashreporter",
    "directx",
    "dotnet",
    "dxsetup",
    "installer",
    "redist",
    "support",
    "vc_redist",
    "vcredist",
];

/// Max scan depth below the install dir when guessing the entry exe.
const EXE_SCAN_DEPTH: usize = 3;

fn lib_err(e: &steamlocate::Error) -> Error {
    Error::Steam(SteamError::Lib(e.to_string()))
}

fn locate() -> Result<SteamDir> {
    steamlocate::locate().map_err(|e| lib_err(&e))
}

fn is_fully_installed(app: &App) -> bool {
    app.state_flags.is_some_and(|f| {
        f.flags()
            .any(|flag| matches!(flag, StateFlag::FullyInstalled))
    })
}

fn is_non_game(app: &App) -> bool {
    is_non_game_raw(app.app_id, app.name.as_deref())
}

/// Pure part of [`is_non_game`], separated so tests don't need to
/// construct steamlocate's `#[non_exhaustive]` App.
fn is_non_game_raw(appid: u32, name: Option<&str>) -> bool {
    NON_GAME_APPIDS.contains(&appid)
        || name.is_some_and(|n| NON_GAME_NAMES.iter().any(|bad| n.eq_ignore_ascii_case(bad)))
}

/// Scan every library for fully-installed games. The Steam client process
/// must be running (import is a user-triggered, interactive flow and we
/// report a clear state instead of letting the UI mistake a dead client for
/// an empty library).
pub fn list_installed_games() -> Result<SteamListResult> {
    if !win_procs::is_process_running("steam.exe") {
        return Ok(SteamListResult::NotRunning);
    }

    let steam_dir = locate()?;
    let mut out = Vec::new();
    for library in steam_dir.libraries().map_err(|e| lib_err(&e))? {
        let library = library.map_err(|e| lib_err(&e))?;
        for app in library.apps() {
            let app = match app {
                Ok(a) => a,
                // one broken manifest must not fail the whole scan
                Err(e) => {
                    warn!("skipping unparsable appmanifest: {e}");
                    continue;
                },
            };
            if is_non_game(&app) || !is_fully_installed(&app) {
                continue;
            }
            let Some(name) = app.name.clone() else {
                continue;
            };
            let install_dir = library.resolve_app_dir(&app);
            let exe_path = detect_game_exe(&install_dir, &name);
            out.push(SteamGameEntry {
                appid: app.app_id,
                name,
                install_dir: to_forward_slashes(&install_dir),
                size_on_disk: app.size_on_disk,
                cover_url: format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900.jpg",
                    app.app_id
                ),
                exe_path: exe_path.as_deref().map(to_forward_slashes),
            });
        }
    }
    out.sort_by_key(|a| a.name.to_lowercase());
    info!("steam scan: {} installed games", out.len());
    Ok(SteamListResult::Games { games: out })
}

fn to_forward_slashes(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

/// Current install dir of an appid from the live library, `None` when the
/// game is not installed in any library anymore.
#[must_use]
pub fn resolve_app_install_dir(appid: u32) -> Option<PathBuf> {
    let steam_dir = locate().ok()?;
    steam_dir
        .find_app(appid)
        .ok()
        .flatten()
        .map(|(app, library)| library.resolve_app_dir(&app))
}

/// Resolve launch paths for a steam game. The live library wins (the
/// library may have moved since import); the variable-templated snapshot is
/// the fallback. The exe falls back to a fresh heuristic scan when the
/// stored guess no longer exists (another device's path, game update).
pub fn resolve_launch_paths(
    lock: &Config,
    game_name: &str,
    steam: &SteamInfo,
) -> Result<SteamLaunchPaths> {
    let install_dir: PathBuf = resolve_app_install_dir(steam.appid)
        .or_else(|| lock.resolve_var(&steam.install_dir).ok().map(PathBuf::from))
        .ok_or_else(|| Error::Steam(SteamError::InstallDirNotFound(steam.appid)))?;

    let exe_path = match &steam.exe_path {
        Some(p) => {
            let resolved = lock.resolve_var(p)?;
            if Path::new(&resolved).is_file() {
                resolved
            } else {
                detect_game_exe(&install_dir, game_name).map_or_else(
                    || install_dir.to_string_lossy().into_owned(),
                    |p| p.to_string_lossy().into_owned(),
                )
            }
        },
        // The exe is only a hint (DLL side-load target / current_dir source),
        // never the spawn target — the install dir itself is an acceptable
        // last resort; speedup's arch detect then falls back to X64.
        None => install_dir.to_string_lossy().into_owned(),
    };

    let current_dir = Path::new(&exe_path)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map_or_else(
            || install_dir.to_string_lossy().into_owned(),
            |p| p.to_string_lossy().into_owned(),
        );
    Ok(SteamLaunchPaths {
        exe_path,
        current_dir,
        install_dir,
    })
}

/// Heuristic entry-exe guess: score every .exe (depth-limited, redistributable
/// dirs skipped) by name similarity with the game name, then by shallowness,
/// then by file size. appmanifests carry no launch-target info, and the guess
/// only needs to be right for the DLL side-load deploy dir.
fn detect_game_exe(install_dir: &Path, game_name: &str) -> Option<PathBuf> {
    let target = normalize_name(game_name);
    let target_dir = install_dir
        .file_name()
        .map(|n| normalize_name(&n.to_string_lossy()));

    let mut best: Option<(Score, PathBuf)> = None;
    for entry in walkdir::WalkDir::new(install_dir)
        .max_depth(EXE_SCAN_DEPTH)
        .into_iter()
        .flatten()
    {
        if !entry.file_type().is_file() {
            continue;
        }
        if !entry
            .path()
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("exe"))
        {
            continue;
        }
        let Ok(rel) = entry.path().strip_prefix(install_dir) else {
            continue;
        };
        if rel
            .components()
            .any(|c| REDIST_DIRS.contains(&c.as_os_str().to_string_lossy().to_lowercase().as_str()))
        {
            continue;
        }

        let stem = normalize_name(
            &entry
                .path()
                .file_stem()
                .map(|s| s.to_string_lossy())
                .unwrap_or_default(),
        );
        let name_match = if name_matches(&stem, &target) {
            2
        } else {
            i32::from(
                target_dir
                    .as_deref()
                    .is_some_and(|d| name_matches(&stem, d)),
            )
        };
        let size = entry.metadata().map_or(0, |m| m.len());
        let score = Score {
            name_match,
            depth: Reverse(u64::try_from(entry.depth()).unwrap_or(u64::MAX)),
            size,
        };
        if best.as_ref().is_none_or(|(s, _)| score > *s) {
            best = Some((score, entry.path().to_path_buf()));
        }
    }
    best.map(|(_, p)| p)
}

#[derive(PartialEq, Eq, PartialOrd, Ord)]
struct Score {
    name_match: i32,
    // shallower wins → Reverse so a bigger Score is better on every field
    depth: Reverse<u64>,
    size: u64,
}

/// Keep only alphanumerics (unicode), lowercased — makes "Meteor World
/// Actor: Badge & Dagger" comparable to "MeteorWorldActorBD".
fn normalize_name(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn name_matches(stem: &str, target: &str) -> bool {
    !target.is_empty()
        && (stem == target
            || (target.len() >= 3 && stem.contains(target))
            || (stem.len() >= 3 && target.contains(stem)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_name_matching_exe_over_larger_unrelated_one() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // 3 MB unrelated exe at root vs 1 MB name-matching exe
        std::fs::write(root.join("CrashHandler.exe"), vec![0u8; 3 * 1024 * 1024]).unwrap();
        std::fs::write(root.join("My Game.exe"), vec![0u8; 1024]).unwrap();
        let picked = detect_game_exe(root, "My Game: Deluxe Edition");
        assert_eq!(
            picked.as_deref().and_then(|p| p.file_name()),
            Some("My Game.exe".as_ref())
        );
    }

    #[test]
    fn skips_redist_dirs_and_falls_back_to_size() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("DirectX")).unwrap();
        std::fs::write(root.join("DirectX/DXSETUP.exe"), vec![0u8; 1024]).unwrap();
        std::fs::write(root.join("Launcher.exe"), vec![0u8; 4096]).unwrap();
        let picked = detect_game_exe(root, "Something Else Entirely");
        assert_eq!(
            picked.as_deref().and_then(|p| p.file_name()),
            Some("Launcher.exe".as_ref())
        );
    }

    #[test]
    fn no_exe_yields_none() {
        let dir = tempfile::tempdir().unwrap();
        assert!(detect_game_exe(dir.path(), "any").is_none());
    }

    #[test]
    fn normalization_and_matching() {
        assert_eq!(
            normalize_name("Meteor World Actor: Badge & Dagger!"),
            "meteorworldactorbadgedagger"
        );
        assert!(name_matches("mygame", "mygame"));
        assert!(name_matches("mygamelauncher", "mygame"));
        assert!(name_matches("myg", "mygame_x"));
        assert!(!name_matches("zzz", "mygame"));
    }

    #[test]
    fn non_game_filtering() {
        // known ids (legacy + current) and exact name, any casing
        assert!(is_non_game_raw(228983, None));
        assert!(is_non_game_raw(2289838, None));
        assert!(is_non_game_raw(
            123456,
            Some("Steamworks Common Redistributables")
        ));
        // real games must survive both guards
        assert!(!is_non_game_raw(123456, Some("My Game")));
    }
}

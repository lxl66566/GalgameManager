//! Helpers for spawning the game inside a transient systemd user scope.
//!
//! On systemd-enabled systems this gives us free process-tree tracking:
//! every descendant of the spawned program (wrappers, helpers, the game
//! itself) ends up in the same cgroup, which we poll via `cgroup.procs`.

use std::{
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use tokio::process::Command;

use super::super::StartCtx;
use crate::error::{Error, Result};

/// Heuristic check: do we have a usable user systemd manager?
///
/// We require:
/// 1. `systemd-run` to be on `$PATH` (otherwise we can't spawn the scope).
/// 2. `XDG_RUNTIME_DIR` to be set (systemd-run --user needs it).
/// 3. The user manager's private socket to be present (`/run/user/$UID/systemd/private`). This is
///    the most reliable signal that `systemctl --user` will actually talk to something.
pub fn has_systemd_user() -> bool {
    if which("systemd-run").is_none() {
        return false;
    }
    let Some(uid) = current_uid() else {
        return false;
    };
    PathBuf::from(format!("/run/user/{uid}/systemd/private")).exists()
}

/// Look up an executable on `$PATH`. Equivalent to the `which` command.
fn which(bin: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths).find_map(|dir| {
        let full = dir.join(bin);
        let is_exec = std::fs::metadata(&full).is_ok_and(|m| !m.is_dir());
        if is_exec {
            Some(full)
        } else {
            None
        }
    })
}

/// Pre-flight check that the resolved program is actually reachable.
///
/// Returns `Error::Launch` ("executable not found") for programs that
/// cannot be launched, so the caller can distinguish user-side config
/// errors from systemd-side issues. A missing working directory is also rejected here.
/// We deliberately keep this heuristic
/// cheap: a bare name is searched on `$PATH`, an absolute path must
/// exist, and a relative path with a separator is checked against
/// `current_dir` when one is set.
fn validate_program_findable(program: &Path, current_dir: Option<&str>) -> Result<()> {
    let prog_str = program.to_string_lossy();

    // systemd-run exits 1 with its reason only on stderr when
    // --working-directory points to a missing path; reject it here with an
    // actionable message instead.
    if let Some(cd) = current_dir {
        if !Path::new(cd).is_dir() {
            log::warn!("validate_program_findable: working directory not found: {cd}");
            return Err(Error::Cloned(format!(
                "working directory does not exist: {cd}"
            )));
        }
    }
    if program.is_absolute() {
        if program.exists() {
            return Ok(());
        }
        log::warn!("validate_program_findable: absolute path not found: {prog_str}");
        return Err(Error::Launch);
    }
    let has_sep = prog_str.contains('/') || prog_str.contains('\\');
    if !has_sep {
        // Bare command name — must be on $PATH.
        if which(&prog_str).is_some() {
            return Ok(());
        }
        log::warn!("validate_program_findable: '{prog_str}' not found on PATH");
        return Err(Error::Launch);
    }
    // Relative path with a separator — resolve against current_dir if any.
    if let Some(cd) = current_dir {
        let joined = Path::new(cd).join(program);
        if joined.exists() {
            return Ok(());
        }
        log::warn!("validate_program_findable: relative path '{prog_str}' not found under '{cd}'");
        return Err(Error::Launch);
    }
    // No current_dir to resolve against — let the launcher try.
    Ok(())
}

/// Best-effort UID discovery.
///
/// We avoid pulling in `libc` just for `getuid()`: the runtime dir
/// already contains the UID on every systemd-managed distro.
fn current_uid() -> Option<u32> {
    let dir = std::env::var("XDG_RUNTIME_DIR").ok()?;
    let last = dir.trim_end_matches('/').rsplit('/').next()?;
    last.parse().ok()
}

/// How many bytes of captured stderr to inline into errors / logs.
const STDERR_TAIL_BYTES: u64 = 2048;

/// stderr of `systemd-run` (and, via fd inheritance, of the game itself)
/// lands here to diagnose launch failures.
///
/// Temp dir on purpose: the name is unique per launch (unit names embed the
/// app pid) and the OS wipes it on reboot, so game output never grows the
/// app's own log folder.
fn stderr_log_path(unit_name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("{unit_name}.stderr.log"))
}

/// Read the last ~[`STDERR_TAIL_BYTES`] of a stderr capture file.
///
/// Snaps to a UTF-8 boundary. Returns `None` for
/// an empty (or unreadable) tail.
fn read_stderr_tail(path: &Path) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(STDERR_TAIL_BYTES);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    // Skip leading continuation bytes when `start` landed mid-char.
    let begin = buf.iter().take_while(|b| **b & 0xc0 == 0x80).count();
    let s = String::from_utf8_lossy(&buf[begin..]).trim().to_string();
    (!s.is_empty()).then_some(s)
}

/// Spawn the resolved [`StartCtx`] command in a transient user scope.
///
/// On success returns `Ok(Some(procs_path))` when cgroup tracking is
/// available, or `Ok(None)` when the scope was created but its cgroup
/// could not be resolved (caller should fall back to unit-liveness
/// polling).
///
/// Error semantics (for the caller's fallback decision):
/// * `Error::Io` — `systemd-run` itself could not be invoked; safe to retry as a direct child
///   spawn.
/// * Anything else — the user's command or systemd configuration is at fault; surface the error
///   instead of masking it.
pub async fn spawn_in_scope(start_ctx: &StartCtx, unit_name: &str) -> Result<Option<PathBuf>> {
    const SYSTEMD_RUN_PROBE: Duration = Duration::from_millis(500);

    let parts = start_ctx.resolved_parts()?;

    // Pre-validate the program is actually findable. `systemd-run`'s own
    // "executable not found" failure is indistinguishable from real
    // systemd-side issues at the caller side, so we surface it eagerly as
    // `Error::Launch` (which the caller treats as non-fallbackable).
    validate_program_findable(&parts.program, parts.current_dir.as_deref())?;

    let mut cmd = Command::new("systemd-run");
    cmd.arg("--user")
        .arg("--scope")
        .arg(format!("--unit={unit_name}"));

    if let Some(cwd) = parts.current_dir {
        cmd.arg(format!("--working-directory={cwd}"));
    }
    if let Some(env_map) = parts.env {
        for (k, v) in env_map {
            cmd.arg(format!("--setenv={k}={v}"));
        }
    }

    cmd.arg("--").arg(&parts.program).args(parts.args);

    // NB: stderr must not be piped. With `--scope` the spawned command is
    // forked as a child of `systemd-run` and inherits its file descriptors.
    // If we pipe stderr, the game holds the pipe open and `output()` blocks
    // until the game exits.
    //
    // A regular file gives the best of both worlds: the game inheriting
    // the fd never blocks, and systemd-run's own failure reason survives for the probe below to
    // surface. See `stderr_log_path`.
    let stderr_path = stderr_log_path(unit_name);
    let stderr_capture = match std::fs::File::create(&stderr_path) {
        Ok(f) => {
            cmd.stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::from(f));
            Some(stderr_path)
        },
        Err(e) => {
            // Capture is a diagnostic nicety, never worth failing the launch.
            log::warn!("stderr capture unavailable ({e}); game stderr discarded");
            cmd.stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            None
        },
    };

    let mut child = cmd.spawn().map_err(|e| {
        log::warn!("systemd-run invocation failed: {e}");
        Error::from(e)
    })?;

    // Do NOT synchronously wait for systemd-run to exit. In --scope mode
    // systemd-run forks the game as its own child and waits on it, so it
    // lives as long as the game session; a synchronous `wait()` would block
    // for that entire session — by the time it returned, the spawn log
    // would fire, the UI would never see `game://spawn` until the game was
    // already gone, and cgroup tracking would race with scope teardown.
    //
    // Instead we briefly poll for an immediate failure. If systemd-run is still alive
    // after the timeout, the scope was registered successfully and we
    // move on; a background task reaps the orphaned parent to avoid a
    // zombie.
    match tokio::time::timeout(SYSTEMD_RUN_PROBE, child.wait()).await {
        Ok(Ok(status)) if !status.success() => {
            // Prefer the captured stderr: systemd-run prints its real
            // failure reason there.
            let detail = stderr_capture.as_deref().and_then(read_stderr_tail);
            match (&detail, &stderr_capture) {
                (Some(d), Some(p)) => log::warn!(
                    "systemd-run exited with {:?}: {d} (full stderr: {})",
                    status.code(),
                    p.display()
                ),
                _ => log::warn!(
                    "systemd-run exited with {:?}; check `journalctl --user-unit {unit_name}`",
                    status.code()
                ),
            }
            let reason = detail.unwrap_or_else(|| {
                format!("no stderr captured; check `journalctl --user-unit {unit_name}`")
            });
            return Err(Error::Cloned(format!(
                "systemd-run exited with status {:?}: {reason}",
                status.code()
            )));
        },
        Ok(Ok(_)) => {
            // Clean exit: scope registered, game forking. Proceed.
        },
        Ok(Err(e)) => {
            log::warn!("systemd-run wait failed: {e}");
            return Err(Error::from(e));
        },
        Err(_) => {
            // Timeout: systemd-run is still alive (blocking on the scope
            // lifetime). Move it to a background reaper and continue.
            log::debug!(
                "systemd-run still running after {SYSTEMD_RUN_PROBE:?} (expected with --scope); \
                 proceeding with scope tracking in the background"
            );
            tokio::spawn(async move {
                if let Err(e) = child.wait().await {
                    log::debug!("systemd-run background reap failed: {e}");
                }
            });
        },
    }

    // Best-effort cgroup resolution. The scope was registered, but on
    // some systemd configurations `ControlGroup` may be briefly empty or
    // the cgroup v2 layout differs. Degrade to unit-liveness polling
    // instead of failing the whole launch.
    //
    // The budget is generous (20 × 50 ms = 1 s) because we no longer
    // block on systemd-run's exit — registration can still be in flight
    // right after the probe timeout.
    let cgroup_subpath = match retry_find_cgroup(unit_name, 20, Duration::from_millis(50)).await {
        Ok(cg) => cg,
        Err(e) => {
            log::warn!(
                "cgroup resolution failed for {unit_name}: {e}; falling back to unit-liveness \
                 polling"
            );
            return Ok(None);
        },
    };

    let procs_path = cgroup_v2_procs_path(&cgroup_subpath);
    if !procs_path.exists() {
        log::warn!(
            "systemd scope {unit_name} reported cgroup {cgroup_subpath:?} but {} is missing; \
             falling back to unit-liveness polling",
            procs_path.display()
        );
        return Ok(None);
    }
    Ok(Some(procs_path))
}

/// Query systemd for the unit's `ControlGroup` property. Retries a few
/// times as cheap insurance: scope registration is a synchronous D-Bus
/// call inside systemd-run, but under load it may not be visible to a
/// freshly spawned `systemctl` query yet.
async fn retry_find_cgroup(unit_name: &str, tries: u32, delay: Duration) -> Result<String> {
    let mut last_err: Option<String> = None;
    for _ in 0..tries {
        match query_control_group(unit_name).await {
            Ok(cg) if !cg.is_empty() => return Ok(cg),
            Ok(_) => last_err = Some("empty ControlGroup".into()),
            Err(e) => last_err = Some(format!("{e}")),
        }
        tokio::time::sleep(delay).await;
    }
    Err(Error::Cloned(format!(
        "could not resolve cgroup for {unit_name}: {}",
        last_err.unwrap_or_else(|| "unknown".into())
    )))
}

/// Spawns `systemctl --user show` to read the unit's `ControlGroup`
/// property. Avoids pulling in a full systemd D-Bus binding; the call
/// happens once per game launch so a process spawn is acceptable.
async fn query_control_group(unit_name: &str) -> Result<String> {
    let output = Command::new("systemctl")
        .args([
            "--user",
            "show",
            unit_name,
            "--property=ControlGroup",
            "--value",
        ])
        // Silence noisy stderr if the unit doesn't exist yet.
        .stderr(Stdio::null())
        .output()
        .await?;

    if !output.status.success() {
        return Err(Error::Cloned(format!(
            "systemctl show exited {:?}",
            output.status.code()
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Resolve a relative cgroup path (as returned by systemd's
/// `ControlGroup` property) to its `cgroup.procs` file on cgroup v2.
///
/// We assume cgroup v2 here: every modern desktop systemd distro
/// (Arch / Fedora / Ubuntu 21.10+ / Debian 11+) uses the unified
/// hierarchy by default. On cgroup v1 the lookup would simply miss,
/// which the caller handles as "no processes" and eventually exits the
/// game loop — same effect as the child fallback.
fn cgroup_v2_procs_path(cgroup_subpath: &str) -> PathBuf {
    let trimmed = cgroup_subpath.trim_start_matches('/');
    Path::new("/sys/fs/cgroup")
        .join(trimmed)
        .join("cgroup.procs")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stderr_tail_snaps_to_utf8_boundary() {
        let p = std::env::temp_dir().join("galmgr-stderr-tail-test.log");
        std::fs::write(&p, format!("{}缘之空", "x".repeat(3000))).unwrap();

        let tail = read_stderr_tail(&p).unwrap();

        assert!(tail.ends_with("缘之空"));
        // Cut window never contains a replacement char from a sliced
        // multi-byte sequence.
        assert!(!tail.contains('\u{FFFD}'));
    }

    #[test]
    fn stderr_tail_empty_file_is_none() {
        let p = std::env::temp_dir().join("galmgr-stderr-tail-empty.log");
        std::fs::write(&p, "").unwrap();
        assert!(read_stderr_tail(&p).is_none());
    }

    #[test]
    fn validate_rejects_missing_working_directory() {
        let exe = std::env::temp_dir().join("galmgr-validate-test-exe");
        std::fs::write(&exe, b"").unwrap();

        validate_program_findable(&exe, Some("/definitely/not/here")).unwrap_err();
        validate_program_findable(&exe, Some(exe.parent().unwrap().to_str().unwrap())).unwrap();
    }
}

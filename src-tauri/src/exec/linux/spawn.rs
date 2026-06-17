//! Helpers for spawning the game inside a transient systemd user scope.
//!
//! On systemd-enabled systems this gives us free process-tree tracking:
//! every descendant of the spawned program (wrappers, helpers, the game
//! itself) ends up in the same cgroup, which we poll via `cgroup.procs`.

use std::{
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
/// 3. The user manager's private socket to be present
///    (`/run/user/$UID/systemd/private`). This is the most reliable signal that
///    `systemctl --user` will actually talk to something.
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
        let is_exec = std::fs::metadata(&full)
            .ok()
            .map(|m| !m.is_dir())
            .unwrap_or(false);
        if is_exec { Some(full) } else { None }
    })
}

/// Pre-flight check that the resolved program is actually reachable.
///
/// Returns `Error::Launch` ("executable not found") for programs that
/// cannot be launched, so the caller can distinguish user-side config
/// errors from systemd-side issues. We deliberately keep this heuristic
/// cheap: a bare name is searched on `$PATH`, an absolute path must
/// exist, and a relative path with a separator is checked against
/// `current_dir` when one is set.
fn validate_program_findable(program: &Path, current_dir: Option<&str>) -> Result<()> {
    let prog_str = program.to_string_lossy();
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
        log::warn!(
            "validate_program_findable: relative path '{}' not found under '{}'",
            prog_str,
            cd
        );
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

/// Spawn the resolved [`StartCtx`] command in a transient user scope.
///
/// On success returns `Ok(Some(procs_path))` when cgroup tracking is
/// available, or `Ok(None)` when the scope was created but its cgroup
/// could not be resolved (caller should fall back to unit-liveness
/// polling).
///
/// Error semantics (for the caller's fallback decision):
/// * `Error::Io` — `systemd-run` itself could not be invoked; safe to
///   retry as a direct child spawn.
/// * Anything else — the user's command or systemd configuration is at
///   fault; surface the error instead of masking it.
pub async fn spawn_in_scope(start_ctx: &StartCtx, unit_name: &str) -> Result<Option<PathBuf>> {
    let parts = start_ctx.resolved_parts()?;

    // Pre-validate the program is actually findable. `systemd-run`'s own
    // "executable not found" failure is indistinguishable from real
    // systemd-side issues at the caller side, so we surface it eagerly as
    // `Error::Launch` (which the caller treats as non-fallbackable).
    validate_program_findable(&parts.program, parts.current_dir.as_deref())?;

    let mut cmd = Command::new("systemd-run");
    cmd.arg("--user")
        .arg("--scope")
        // Don't block on the unit's lifetime — we'll track via cgroup.
        .arg("--no-block")
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

    // NB: stderr is intentionally *not* piped. With `--scope` the spawned
    // command is forked as a child of `systemd-run` and inherits its file
    // descriptors. If we pipe stderr, the game holds the pipe open and
    // `output()` blocks until the game exits — by which time the scope is
    // already gone and cgroup tracking fails. With `stderr=null` the game
    // inherits `/dev/null`, and `systemd-run --no-block` returns almost
    // immediately after registering the scope.
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let status = cmd.status().await.map_err(|e| {
        log::warn!("systemd-run invocation failed: {e}");
        Error::from(e)
    })?;

    if !status.success() {
        log::warn!(
            "systemd-run exited with {:?} (stderr suppressed; check `journalctl --user-unit {}` for details)",
            status.code(),
            unit_name
        );
        return Err(Error::Cloned(format!(
            "systemd-run exited with status {:?}",
            status.code()
        )));
    }

    // Best-effort cgroup resolution. The scope was registered, but on
    // some systemd configurations `ControlGroup` may be briefly empty or
    // the cgroup v2 layout differs. Degrade to unit-liveness polling
    // instead of failing the whole launch.
    let cgroup_subpath = match retry_find_cgroup(unit_name, 10, Duration::from_millis(25)).await {
        Ok(cg) => cg,
        Err(e) => {
            log::warn!(
                "cgroup resolution failed for {unit_name}: {e}; \
                 falling back to unit-liveness polling"
            );
            return Ok(None);
        }
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
/// times because `--no-block` returns before the unit is registered.
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

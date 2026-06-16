//! Helpers for spawning the game inside a transient systemd user scope.
//!
//! On systemd-enabled systems this gives us free process-tree tracking:
//! every descendant of the spawned program (wrappers, helpers, the game
//! itself) ends up in the same cgroup, which we poll via `cgroup.procs`.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use crate::error::{Error, Result};

use super::super::StartCtx;

/// Heuristic check: do we have a usable user systemd manager?
///
/// We require:
/// 1. `systemd-run` to be on `$PATH` (otherwise we can't spawn the scope).
/// 2. `XDG_RUNTIME_DIR` to be set (systemd-run --user needs it).
/// 3. The user manager's private socket to be present
///    (`/run/user/$UID/systemd/private`). This is the most reliable
///    signal that `systemctl --user` will actually talk to something.
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
        if is_exec {
            Some(full)
        } else {
            None
        }
    })
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

/// Spawn the resolved [`StartCtx`] command in a transient user scope,
/// returning the absolute path of the unit's `cgroup.procs` file so the
/// caller can poll process membership.
///
/// On any failure the caller is expected to fall back to direct
/// [`tokio::process::Command::spawn`] — we never block or hang waiting
/// for systemd here.
pub async fn spawn_in_scope(start_ctx: &StartCtx, unit_name: &str) -> Result<PathBuf> {
    let parts = start_ctx.resolved_parts()?;

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

    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let output = cmd
        .output()
        .await
        .map_err(|e| {
            log::warn!("systemd-run invocation failed: {e}");
            Error::from(e)
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::warn!(
            "systemd-run exited with {:?}: {}",
            output.status.code(),
            stderr.trim()
        );
        return Err(Error::Launch);
    }

    // systemd-run with --no-block returns before the unit is fully
    // realized on the manager side. Give it a brief moment to land,
    // retrying a couple of times so we don't race with the registrar.
    let cgroup_subpath = retry_find_cgroup(unit_name, 10, Duration::from_millis(25)).await?;

    let procs_path = cgroup_v2_procs_path(&cgroup_subpath);
    if !procs_path.exists() {
        log::warn!(
            "systemd scope {unit_name} reported cgroup {cgroup_subpath:?} but {} is missing",
            procs_path.display()
        );
        return Err(Error::Launch);
    }
    Ok(procs_path)
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
    Path::new("/sys/fs/cgroup").join(trimmed).join("cgroup.procs")
}

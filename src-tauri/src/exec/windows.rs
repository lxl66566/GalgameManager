use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

use chrono::TimeDelta;
use log::{error, info, trace, warn};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter as _};
use tokio::{sync::oneshot, time};
use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, IsProcessInJob,
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JobObjectBasicAccountingInformation,
            QueryInformationJobObject,
        },
        Threading::{
            GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA,
            PROCESS_TERMINATE,
        },
    },
    UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
};
use windows_result::BOOL;

use crate::{
    db::CONFIG,
    error::{Error, Result},
    steam::SteamError,
    utils::win_procs,
};

/// Exit code returned by `GetExitCodeProcess` for a process that is still
/// running. Anything else is the real exit code (0 = clean, non-zero =
/// abnormal). Hard-coded here to avoid pulling in another windows feature.
const STILL_ACTIVE: u32 = 259;

/// PID of the process that owns the current foreground window.
fn foreground_pid() -> Option<u32> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return None;
        }

        let mut pid = 0;
        GetWindowThreadProcessId(hwnd, Some(&raw mut pid));
        (pid != 0).then_some(pid)
    }
}

pub struct GameJob {
    handle: HANDLE,
    /// Long-lived handle to the most recent foreground process that
    /// belonged to this job (i.e. the game itself — even when launched
    /// via Locale Emulator or another wrapper, the foreground window is
    /// the game's own window, so this PID tracks the *real* game
    /// process, not the launcher).
    ///
    /// We keep the handle so that after the process exits we can still
    /// call `GetExitCodeProcess` to learn *how* it exited. The OS keeps
    /// the underlying process object alive as long as anyone holds an
    /// open handle, so even if the process is already reaped from the
    /// job (and its PID possibly reused) our `GetExitCodeProcess` call
    /// still targets the right process.
    ///
    /// Best-effort: if the game never reached the foreground (e.g. the
    /// user alt-tabbed away immediately after launch and never came
    /// back), this stays `None` and `last_exit_success` conservatively
    /// reports `true`.
    game_pid: Option<u32>,
    game_handle: Option<HANDLE>,
}

// SAFETY: A Job Object handle is an opaque kernel object. The Windows API
// explicitly allows assigning processes to (and querying) a Job from any
// thread, and `GameJob` performs no shared mutable access outside of the
// `&self` calls that hand the handle to the API. The handle is only freed
// once in `Drop`, from a single owner. Therefore it is safe to move the
// handle between threads (`Send`) and share references (`Sync`).
unsafe impl Send for GameJob {}

unsafe impl Sync for GameJob {}

impl GameJob {
    fn new() -> Result<Self> {
        let handle = unsafe { CreateJobObjectW(None, None) }?;
        Ok(Self {
            handle,
            game_pid: None,
            game_handle: None,
        })
    }

    fn assign_process(&self, pid: u32) -> Result<()> {
        // SAFETY: plain kernel call with our own job handle.
        unsafe { assign_pid_to_job(self.handle, pid)? };
        Ok(())
    }

    fn has_active_processes(&self) -> bool {
        unsafe {
            let mut info = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
            let mut return_length = 0;
            // Struct size always fits in u32.
            #[allow(clippy::cast_possible_truncation)]
            let buf_size = size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32;
            let res = QueryInformationJobObject(
                Some(self.handle),
                JobObjectBasicAccountingInformation,
                (&raw mut info).cast(),
                buf_size,
                Some(&raw mut return_length),
            );

            if res.is_err() {
                return false;
            }
            // TotalProcesses is the historical total; ActiveProcesses is the
            // currently alive count.
            info.ActiveProcesses > 0
        }
    }

    /// Returns `true` if the game exited cleanly.
    ///
    /// We query the exit code of the foreground process we tracked while
    /// the game was running. Exit code 0 (or `STILL_ACTIVE`, which should
    /// not happen once `has_active_processes` is false but is treated as
    /// clean defensively) ⇒ success; anything else ⇒ abnormal. If we
    /// never captured a foreground PID, we conservatively report success
    /// to preserve the historical behaviour.
    #[must_use]
    pub fn last_exit_success(&self) -> bool {
        let Some(h) = self.game_handle else {
            return true;
        };
        let mut code: u32 = 0;
        let ok = unsafe { GetExitCodeProcess(h, &raw mut code).is_ok() };
        // !ok ⇒ the handle is somehow invalid; fall back to "clean" so we
        // don't spam false-positive abnormal toasts.
        !ok || code == 0 || code == STILL_ACTIVE
    }

    pub fn is_focused(&mut self) -> bool {
        let Some(foreground_pid) = foreground_pid() else {
            return false;
        };

        let in_job = unsafe {
            // PROCESS_QUERY_LIMITED_INFORMATION is enough for
            // IsProcessInJob and succeeds more often than ALL_ACCESS.
            let Ok(process_handle) =
                OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, foreground_pid)
            else {
                return false;
            };
            let mut is_in_job: BOOL = false.into();
            let _ = IsProcessInJob(process_handle, Some(self.handle), &raw mut is_in_job);
            let _ = CloseHandle(process_handle);
            is_in_job.as_bool()
        };

        // When the game's own window is focused, hold a long-lived handle so
        // the exit code can be queried after exit; reuse it while the PID is
        // unchanged to avoid per-second open/close.
        if in_job && self.game_pid != Some(foreground_pid) {
            if let Some(old) = self.game_handle.take() {
                unsafe {
                    let _ = CloseHandle(old);
                }
            }
            if let Ok(h) =
                unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, foreground_pid) }
            {
                self.game_pid = Some(foreground_pid);
                self.game_handle = Some(h);
            }
        }

        in_job
    }
}

impl Drop for GameJob {
    fn drop(&mut self) {
        unsafe {
            if let Some(h) = self.game_handle.take() {
                let _ = CloseHandle(h);
            }
            let _ = CloseHandle(self.handle);
        }
    }
}

// --- main game loop ---

const SAVE_INTERVAL: TimeDelta = TimeDelta::seconds(60);

/// Tracking strategy for a launched game.
pub enum GameLaunchRes {
    /// Preferred path: the launcher is assigned to a Job Object, so the
    /// whole process tree (incl. wrappers like Locale Emulator) is tracked
    /// and focus matching works via `IsProcessInJob`.
    Job(GameJob),
    /// Degraded path used when `AssignProcessToJobObject` fails (e.g. a
    /// restrictive job-nesting policy). We poll the direct child's liveness
    /// instead of aborting the launch: the game itself spawned fine, and
    /// killing a healthy, already-running game just because tracking is
    /// degraded is worse than losing precise tracking. Trade-offs (same as
    /// the Linux `Child` fallback): wrapper-launched games may be reported
    /// as exited when the launcher exits, and focus matching only works
    /// when the launcher itself owns the foreground window.
    Child {
        // Boxed: tokio Child is ~280 bytes, inflating the whole enum for
        // every variant otherwise (clippy::large_enum_variant).
        child: Box<tokio::process::Child>,
        pid: u32,
        /// Exit status captured when `try_wait` observed the child had
        /// exited, for `last_exit_success()` after the fact.
        last_success: Option<bool>,
    },
}

impl GameLaunchRes {
    fn has_active_processes(&mut self) -> bool {
        match self {
            Self::Job(job) => job.has_active_processes(),
            Self::Child {
                child,
                last_success,
                ..
            } => match child.try_wait() {
                Ok(Some(status)) => {
                    *last_success = Some(status.success());
                    false
                },
                Ok(None) => true,
                Err(_) => {
                    *last_success = Some(false);
                    false
                },
            },
        }
    }

    fn is_focused(&mut self) -> bool {
        match self {
            Self::Job(job) => job.is_focused(),
            // The fallback path only tracks the launcher PID; see the
            // `Child` variant docs for the trade-off.
            Self::Child { pid, .. } => foreground_pid() == Some(*pid),
        }
    }

    fn last_exit_success(&self) -> bool {
        match self {
            Self::Job(job) => job.last_exit_success(),
            Self::Child { last_success, .. } => last_success.unwrap_or(true),
        }
    }
}

pub async fn launch_game(
    game_id: u32,
    app: AppHandle,
    game_start_sender: oneshot::Sender<()>,
    start_ctx: super::StartCtx,
) -> Result<GameLaunchRes> {
    let child = start_ctx.build_async_command()?.spawn()?;
    let child_pid = child.id().ok_or(Error::Launch)?;

    // Assign the launcher to the job: any child it spawns later (the game
    // itself) inherits membership automatically.
    let tracker = {
        let job = GameJob::new().map_err(|_| Error::Launch)?;
        match job.assign_process(child_pid) {
            Ok(()) => GameLaunchRes::Job(job),
            Err(e) => {
                warn!(
                    "Failed to assign process {child_pid} to job ({e}); falling back to child \
                     polling"
                );
                GameLaunchRes::Child {
                    child: Box::new(child),
                    pid: child_pid,
                    last_success: None,
                }
            },
        }
    };

    info!("Game spawned: game_id={game_id}");
    app.emit(&format!("game://spawn/{game_id}"), ())?;
    game_start_sender
        .send(())
        .map_err(|()| Error::InvalidChannel("game_start_sender"))?;

    Ok(tracker)
}

// ─── Steam launch path ──────────────────────────────────────────────────────
//
// `steam://rungameid/{appid}` hands the spawn to steam.exe: the game is NOT
// our child, so it does not inherit the Job. But AssignProcessToJobObject
// works on any same-user process — we poll for a process whose exe lives
// under the install dir and assign it into the regular GameJob. Everything
// downstream (game_loop: exit detection, focus tracking, time accounting)
// is reused unchanged.

/// Poll interval for discovering the game process spawned by Steam.
const STEAM_POLL_SECS: u64 = 1;
/// How long to wait for the game process to appear after the URL is
/// triggered. Steam may cloud-sync / update first and launcher chains take
/// even longer — observed ~2.5s for a plain game; no short timeout is safe.
const STEAM_LAUNCH_TIMEOUT_SECS: u64 = 120;
/// After the first process is assigned, keep scanning for sibling processes
/// (e.g. a launcher that spawned the real game before our first assign) to
/// pull into the job. Processes spawned *after* their parent joined the job
/// inherit membership automatically; this only catches pre-assign stragglers.
const STEAM_SIBLING_WINDOW_SECS: u64 = 30;

pub async fn launch_game_steam(
    game_id: u32,
    app: AppHandle,
    game_start_sender: oneshot::Sender<()>,
    appid: u32,
    install_dir: PathBuf,
) -> Result<GameLaunchRes> {
    if !win_procs::is_process_running("steam.exe") {
        return Err(Error::Steam(SteamError::NotRunning));
    }

    // Job first: it stays empty until the waiter discovers the game process,
    // and game_loop only starts after the first successful assignment, so
    // the empty-job "has_active_processes == false" check can never misfire.
    let job = GameJob::new()?;

    let url = format!("steam://rungameid/{appid}");
    opener::open(&url).map_err(Error::Open)?;
    info!("Steam launch triggered: game_id={game_id}, appid={appid}, url={url}");

    let seen: Arc<Mutex<HashSet<u32>>> = Arc::new(Mutex::new(HashSet::new()));
    let deadline = time::Instant::now() + Duration::from_secs(STEAM_LAUNCH_TIMEOUT_SECS);
    loop {
        time::sleep(Duration::from_secs(STEAM_POLL_SECS)).await;
        if time::Instant::now() >= deadline {
            return Err(Error::Steam(SteamError::LaunchTimeout(
                STEAM_LAUNCH_TIMEOUT_SECS,
            )));
        }

        let found = snapshot_pids_under(&install_dir).await;
        let mut assigned_any = false;
        for pid in found {
            if !seen.lock().insert(pid) {
                continue;
            }
            match job.assign_process(pid) {
                Ok(()) => {
                    info!("Steam game process {pid} assigned to job (appid={appid})");
                    assigned_any = true;
                },
                // Most likely raced with a fast-exiting process (OpenProcess
                // fails on a dead pid). Not a launch failure — keep waiting
                // for the next candidate; the whole window expiring is.
                Err(e) => {
                    warn!("Failed to assign pid {pid} to job: {e}");
                    seen.lock().remove(&pid);
                },
            }
        }

        if assigned_any {
            // The session is live: emit spawn (and run after_game_start
            // hooks) only now that a process is actually tracked.
            info!("Steam game spawned: game_id={game_id}, appid={appid}");
            app.emit(&format!("game://spawn/{game_id}"), ())?;
            game_start_sender
                .send(())
                .map_err(|()| Error::InvalidChannel("game_start_sender"))?;
            spawn_sibling_scanner(job.handle, install_dir, seen);
            return Ok(GameLaunchRes::Job(job));
        }
    }
}

/// Off-thread process snapshot: pids whose exe path lies under `dir`.
async fn snapshot_pids_under(dir: &Path) -> Vec<u32> {
    let dir = dir.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || find_pids_under_sync(&dir))
        .await
        .unwrap_or_default()
}

fn find_pids_under_sync(dir: &Path) -> Vec<u32> {
    win_procs::snapshot_processes()
        .into_iter()
        .filter(|p| {
            win_procs::process_image_path(p.pid)
                .is_some_and(|exe| win_procs::path_is_under(&exe, dir))
        })
        .map(|p| p.pid)
        .collect()
}

/// Open + assign one (arbitrary, non-child) process to a job. Does NOT
/// require a parent/child relationship — `PROCESS_SET_QUOTA` is what
/// `AssignProcessToJobObject` needs on the handle.
///
/// # Safety
///
/// `job` must be a live job-object handle for the whole call (the caller
/// owning the handle must not have closed it).
unsafe fn assign_pid_to_job(job: HANDLE, pid: u32) -> windows_result::Result<()> {
    unsafe {
        let process_handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid)?;
        let res = AssignProcessToJobObject(job, process_handle);
        // Close the raw process handle explicitly; Rust Drop does not close it.
        let _ = CloseHandle(process_handle);
        res
    }
}

/// Late-arrival catch-up scanner (see [`STEAM_SIBLING_WINDOW_SECS`]).
///
/// Holds a raw copy of the job HANDLE: the `GameJob` itself moves into the
/// game loop, and the copy is only ever passed to AssignProcessToJobObject —
/// never closed here (the job's own Drop owns the single close). The window
/// is far shorter than any game session, so racing job teardown is
/// practically impossible; even then the assign would just fail harmlessly.
fn spawn_sibling_scanner(job_handle: HANDLE, install_dir: PathBuf, seen: Arc<Mutex<HashSet<u32>>>) {
    // raw HANDLE is not Send; wrap it (same rationale as `unsafe impl Send
    // for GameJob` — an opaque kernel handle is safe to move/share).
    // Exposed as a method so closures capture the whole SendHandle instead
    // of disjoint-capturing the raw `.0` field (which is not Send).
    #[derive(Clone, Copy)]
    struct SendHandle(HANDLE);
    unsafe impl Send for SendHandle {}
    impl SendHandle {
        fn assign(self, pid: u32) -> windows_result::Result<()> {
            // SAFETY: plain kernel call on a copied handle value.
            unsafe { assign_pid_to_job(self.0, pid) }
        }
    }

    let job_handle = SendHandle(job_handle);
    std::thread::Builder::new()
        .name("steam-sibling-scanner".into())
        .spawn(move || {
            let deadline =
                std::time::Instant::now() + Duration::from_secs(STEAM_SIBLING_WINDOW_SECS);
            while std::time::Instant::now() < deadline {
                std::thread::sleep(Duration::from_secs(STEAM_POLL_SECS));
                for pid in find_pids_under_sync(&install_dir) {
                    if !seen.lock().insert(pid) {
                        continue;
                    }
                    if let Err(e) = job_handle.assign(pid) {
                        warn!("sibling assign of pid {pid} failed: {e}");
                    } else {
                        info!("sibling process {pid} assigned to job");
                    }
                }
            }
        })
        .map_err(|e| warn!("failed to spawn sibling scanner thread: {e}"))
        .ok();
}

pub async fn game_loop(
    mut job: GameLaunchRes,
    game_id: u32,
    app: AppHandle,
    game_exit_sender: oneshot::Sender<()>,
) -> Result<()> {
    let mut interval = time::interval(Duration::from_secs(1));
    let mut last_time_saved = chrono::Utc::now();
    let mut time_counter = TimeDelta::milliseconds(0);
    let mut total_session = TimeDelta::milliseconds(0);
    let precision_mode = CONFIG.lock().settings.launch.precision_mode;

    loop {
        interval.tick().await;

        if !job.has_active_processes() {
            // Include the final partial chunk
            total_session += time_counter;
            info!(
                "Game exited: game_id={}, playtime={}",
                game_id,
                crate::utils::format_time_delta(total_session)
            );
            // Accumulated from positive ticks — always non-negative.
            #[allow(clippy::cast_sign_loss)]
            let session_secs = total_session.num_seconds() as u64;
            let payload = super::GameExitPayload {
                success: job.last_exit_success(),
                session_secs,
            };
            app.emit(&format!("game://exit/{game_id}"), &payload)?;
            // A failure here (e.g. the game was deleted from the config
            // mid-session) must not abort the loop: skipping the exit
            // signal would also skip every after_game_exit hook (incl.
            // auto_upload) and leave the frontend stuck on "running".
            if let Err(e) = super::update_game_time(&app, game_id, time_counter, true) {
                error!("update_game_time failed on exit: {e}");
            }
            game_exit_sender
                .send(())
                .map_err(|()| Error::InvalidChannel("game_exit_sender"))?;
            break;
        }

        let now = chrono::Utc::now();
        // Always call is_focused: besides the focus check it maintains
        // game_handle (used to query the exit code); its return value only
        // matters in precision mode.
        let focused = job.is_focused();
        if !precision_mode || focused {
            time_counter += now - last_time_saved;
            trace!("time_counter: {time_counter}");
        }
        last_time_saved = now;

        if time_counter >= SAVE_INTERVAL {
            total_session += time_counter;
            // GameNotFound (deleted mid-session) or a transient save error
            // must not kill the timing loop.
            if let Err(e) = super::update_game_time(&app, game_id, time_counter, false) {
                error!("update_game_time failed: {e}");
            }
            time_counter = TimeDelta::milliseconds(0);
        }
    }

    Ok(())
}

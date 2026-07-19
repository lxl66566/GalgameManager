use std::time::Duration;

use chrono::TimeDelta;
use log::{error, info, trace};
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
};

/// Exit code returned by `GetExitCodeProcess` for a process that is still
/// running. Anything else is the real exit code (0 = clean, non-zero =
/// abnormal). Hard-coded here to avoid pulling in another windows feature.
const STILL_ACTIVE: u32 = 259;

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
        // 创建一个未命名的 Job Object
        let handle = unsafe { CreateJobObjectW(None, None) }?;
        Ok(Self {
            handle,
            game_pid: None,
            game_handle: None,
        })
    }

    // 将进程加入 Job
    fn assign_process(&self, pid: u32) -> Result<()> {
        unsafe {
            // 获取进程句柄，需要 PROCESS_SET_QUOTA | PROCESS_TERMINATE 权限，
            // 但 AssignProcessToJobObject 主要需要句柄有效。
            // 这里使用 PROCESS_ALL_ACCESS 或者特定权限
            let process_handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid)?;

            let res = AssignProcessToJobObject(self.handle, process_handle);
            // 用完进程句柄记得关闭（Rust 的 Drop 不会自动关 Raw Handle）
            let _ = CloseHandle(process_handle);

            res?;
        }
        Ok(())
    }

    // 检查 Job 里是否还有活动的进程
    fn has_active_processes(&self) -> bool {
        unsafe {
            let mut info = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
            let mut return_length = 0;
            let res = QueryInformationJobObject(
                Some(self.handle),
                JobObjectBasicAccountingInformation,
                &mut info as *mut _ as *mut _,
                std::mem::size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                Some(&mut return_length),
            );

            if res.is_err() {
                return false;
            }
            // TotalProcesses 是历史总数，ActiveProcesses 是当前存活数
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
    pub fn last_exit_success(&self) -> bool {
        let Some(h) = self.game_handle else {
            return true;
        };
        let mut code: u32 = 0;
        let ok = unsafe { GetExitCodeProcess(h, &mut code).is_ok() };
        // !ok ⇒ the handle is somehow invalid; fall back to "clean" so we
        // don't spam false-positive abnormal toasts.
        !ok || code == 0 || code == STILL_ACTIVE
    }

    pub fn is_focused(&mut self) -> bool {
        let foreground_pid = unsafe {
            // 1. 获取前台窗口句柄
            let hwnd = GetForegroundWindow();
            if hwnd.is_invalid() {
                return false;
            }

            // 2. 获取窗口对应的 PID
            let mut pid = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return false;
            }
            pid
        };

        let in_job = unsafe {
            // 3. 临时打开进程句柄查询是否属于 Job。
            // PROCESS_QUERY_LIMITED_INFORMATION 权限足够用于 IsProcessInJob，且比
            // ALL_ACCESS 更容易成功
            let Ok(process_handle) =
                OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, foreground_pid)
            else {
                return false;
            };
            let mut is_in_job: BOOL = false.into();
            let _ = IsProcessInJob(process_handle, Some(self.handle), &mut is_in_job);
            let _ = CloseHandle(process_handle);
            is_in_job.as_bool()
        };

        // 4. 当游戏本体的窗口在前台时，长期持有一个 handle 以便
        // 退出时查询退出码。PID 没变就复用旧 handle，避免每秒开关。
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

// --- 主逻辑 ---

const SAVE_INTERVAL: TimeDelta = TimeDelta::seconds(60);

pub type GameLaunchRes = GameJob;

pub async fn launch_game(
    game_id: u32,
    app: AppHandle,
    game_start_sender: oneshot::Sender<()>,
    start_ctx: super::StartCtx,
) -> Result<GameLaunchRes> {
    let child = start_ctx.build_async_command()?.spawn()?;
    let child_pid = child.id().ok_or(Error::Launch)?;

    // 2. 创建 Job 并绑定
    let job = {
        let j = GameJob::new().map_err(|_| Error::Launch)?;
        // 关键点：将启动器加入 Job。
        // 之后启动器生成的任何子进程（游戏本体）都会自动继承进入这个 Job。
        if let Err(e) = j.assign_process(child_pid) {
            error!("Failed to assign process to job: {:?}", e);
        }
        j
    };

    // 3. 发出事件，告知前端已经启动了
    info!("Game spawned: game_id={}", game_id);
    app.emit(&format!("game://spawn/{}", game_id), ())?;
    game_start_sender
        .send(())
        .map_err(|_| Error::InvalidChannel("game_start_sender"))?;

    Ok(job)
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
            info!("Game exited: game_id={}", game_id);
            let payload = super::GameExitPayload {
                success: job.last_exit_success(),
                session_secs: total_session.num_seconds() as u64,
            };
            app.emit(&format!("game://exit/{}", game_id), &payload)?;
            super::update_game_time(&app, game_id, time_counter, true)?;
            game_exit_sender
                .send(())
                .map_err(|_| Error::InvalidChannel("game_exit_sender"))?;
            break;
        }

        let now = chrono::Utc::now();
        // 始终调用 is_focused：除了计时判定外，它还顺带维护用于查询
        // 退出码的 game_handle。非 precision 模式下无视其返回值。
        let focused = job.is_focused();
        if !precision_mode || focused {
            time_counter += now - last_time_saved;
            trace!("time_counter: {time_counter}");
        }
        last_time_saved = now;

        if time_counter >= SAVE_INTERVAL {
            total_session += time_counter;
            super::update_game_time(&app, game_id, time_counter, false)?;
            time_counter = TimeDelta::milliseconds(0);
        }
    }

    Ok(())
}

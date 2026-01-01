use std::{path::Path, time::Duration};

use chrono::TimeDelta;
use tauri::{AppHandle, Emitter as _};
use tokio::{process::Command, time};
use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, IsProcessInJob,
            JobObjectBasicAccountingInformation, QueryInformationJobObject,
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
        },
        Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
        },
    },
    UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
};
use windows_result::BOOL;

use crate::{
    db::CONFIG,
    error::{Error, Result},
};

struct GameJob {
    handle: HANDLE,
}

unsafe impl Send for GameJob {}

unsafe impl Sync for GameJob {}

impl GameJob {
    fn new() -> Result<Self> {
        // 创建一个未命名的 Job Object
        let handle = unsafe { CreateJobObjectW(None, None) }?;
        Ok(Self { handle })
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

    pub fn is_focused(&self) -> bool {
        unsafe {
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

            // 3. 打开进程句柄以查询信息
            // PROCESS_QUERY_LIMITED_INFORMATION 权限足够用于 IsProcessInJob，且比
            // ALL_ACCESS 更容易成功
            let process_handle_res = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);

            if let Ok(process_handle) = process_handle_res {
                let mut is_in_job: BOOL = false.into();

                // 4. 核心判断：该进程是否属于当前的 Job Object
                // IsProcessInJob 的第二个参数是我们创建的 Job Handle
                let _ = IsProcessInJob(process_handle, Some(self.handle), &mut is_in_job);

                // 记得关闭临时打开的进程句柄
                let _ = CloseHandle(process_handle);

                return is_in_job.as_bool();
            }

            false
        }
    }
}

impl Drop for GameJob {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.handle);
        }
    }
}

// --- 主逻辑 ---

const SAVE_INTERVAL: TimeDelta = TimeDelta::seconds(60);

pub async fn launch_game(app: AppHandle, game_id: u32) -> Result<()> {
    let (exe_path, precision_mode) = {
        let lock = CONFIG.lock();
        let exe_path: String = lock.resolve_var(
            &lock
                .get_game_by_id(game_id)?
                .excutable_path
                .clone()
                .ok_or(Error::Launch)?,
        )?;
        let precision_mode = lock.settings.launch.precision_mode;
        (exe_path, precision_mode)
    };

    // 1. 启动进程
    let mut cmd = Command::new(&exe_path);
    if let Some(parent) = Path::new(&exe_path).parent() {
        cmd.current_dir(parent);
    }
    let child = cmd.spawn()?;
    let child_pid = child.id().ok_or(Error::Launch)?;

    app.emit(&format!("game://spawn/{}", game_id), ())?;

    // 2. 创建 Job 并绑定

    let job = {
        let j = GameJob::new().map_err(|_| Error::Launch)?;
        // 关键点：将启动器加入 Job。
        // 之后启动器生成的任何子进程（游戏本体）都会自动继承进入这个 Job。
        if let Err(e) = j.assign_process(child_pid) {
            eprintln!("Failed to assign process to job: {:?}", e);
        }
        j
    };

    let mut interval = time::interval(Duration::from_secs(1));
    let mut last_time_saved = chrono::Utc::now();
    let mut time_counter = TimeDelta::milliseconds(0);

    loop {
        interval.tick().await;

        if !job.has_active_processes() {
            println!("Job object is empty. Game exited.");
            app.emit(&format!("game://exit/{}", game_id), true)?;
            super::update_game_time(&app, game_id, time_counter)?;
            break;
        }

        let now = chrono::Utc::now();
        // 如果没有启用精确模式，或者游戏进程处于前台，则算作有效游玩时间
        if !precision_mode || job.is_focused() {
            time_counter += now - last_time_saved;
            #[cfg(debug_assertions)]
            println!("time_counter: {time_counter}");
        }
        last_time_saved = now;

        if time_counter >= SAVE_INTERVAL {
            super::update_game_time(&app, game_id, time_counter)?;
            time_counter = TimeDelta::milliseconds(0);
        }
    }

    Ok(())
}

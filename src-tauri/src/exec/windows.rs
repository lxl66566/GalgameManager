use std::{path::Path, time::Duration};

use chrono::TimeDelta;
use tauri::{AppHandle, Emitter as _};
use tokio::{process::Command, time};
use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
            QueryInformationJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
        },
        Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE},
    },
};

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
}

impl Drop for GameJob {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.handle);
        }
    }
}

// --- 主逻辑 ---

pub async fn launch_game(app: AppHandle, game_id: u32, save_interval: u32) -> Result<()> {
    let exe_path: String = {
        let lock = CONFIG.lock();
        lock.resolve_var(
            &lock
                .get_game_by_id(game_id)?
                .excutable_path
                .clone()
                .ok_or(Error::Launch)?,
        )?
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
    let mut time_counter = 0;

    loop {
        interval.tick().await;
        time_counter += 1;

        if !job.has_active_processes() {
            println!("Job object is empty. Game exited.");
            app.emit(&format!("game://exit/{}", game_id), true)?;
            break;
        }

        if time_counter >= save_interval as i64 {
            super::update_game_time(&app, game_id, TimeDelta::seconds(time_counter))?;
            time_counter = 0;
        }
    }

    Ok(())
}

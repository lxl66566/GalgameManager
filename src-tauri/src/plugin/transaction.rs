use std::sync::{Arc, Mutex};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CleanupPhase {
    /// 游戏成功启动后执行（或在启动失败时立即回滚）
    AfterGameStart,
    /// 游戏结束后执行（或在启动失败时立即回滚）
    AfterGameExit,
}

type Task = Box<dyn FnOnce() + Send + Sync>;

#[derive(Clone, Default)]
pub struct Transaction {
    after_start: Arc<Mutex<Vec<Task>>>,
    after_exit: Arc<Mutex<Vec<Task>>>,
}

impl Transaction {
    pub fn new() -> Self {
        Self::default()
    }

    /// 注册一个清理任务，任务会按照注册的相反顺序（LIFO）执行
    pub fn add_cleanup<F: FnOnce() + Send + Sync + 'static>(&self, phase: CleanupPhase, f: F) {
        match phase {
            CleanupPhase::AfterGameStart => self.after_start.lock().unwrap().push(Box::new(f)),
            CleanupPhase::AfterGameExit => self.after_exit.lock().unwrap().push(Box::new(f)),
        }
    }

    pub fn execute_after_start(&self) {
        let tasks = std::mem::take(&mut *self.after_start.lock().unwrap());
        for task in tasks.into_iter().rev() {
            task();
        }
    }

    pub fn execute_after_exit(&self) {
        let tasks = std::mem::take(&mut *self.after_exit.lock().unwrap());
        for task in tasks.into_iter().rev() {
            task();
        }
    }

    /// 回滚所有未执行的清理任务
    pub fn rollback(&self) {
        self.execute_after_start();
        self.execute_after_exit();
    }
}

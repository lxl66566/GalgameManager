use std::sync::Arc;

use parking_lot::Mutex;

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
            CleanupPhase::AfterGameStart => self.after_start.lock().push(Box::new(f)),
            CleanupPhase::AfterGameExit => self.after_exit.lock().push(Box::new(f)),
        }
    }

    pub fn execute_after_start(&self) {
        let tasks = std::mem::take(&mut *self.after_start.lock());
        for task in tasks.into_iter().rev() {
            task();
        }
    }

    pub fn execute_after_exit(&self) {
        let tasks = std::mem::take(&mut *self.after_exit.lock());
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

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    /// Shared recorder so closure tasks can push the order they ran in.
    fn recorder() -> Arc<Mutex<Vec<&'static str>>> {
        Arc::new(Mutex::new(Vec::new()))
    }
    fn push(rec: &Arc<Mutex<Vec<&'static str>>>, tag: &'static str) {
        rec.lock().unwrap().push(tag);
    }

    #[test]
    fn lifo_order_within_phase() {
        let rec = recorder();
        let tx = Transaction::new();
        let r1 = rec.clone();
        let r2 = rec.clone();
        let r3 = rec.clone();
        tx.add_cleanup(CleanupPhase::AfterGameExit, move || push(&r1, "a"));
        tx.add_cleanup(CleanupPhase::AfterGameExit, move || push(&r2, "b"));
        tx.add_cleanup(CleanupPhase::AfterGameExit, move || push(&r3, "c"));

        tx.execute_after_exit();
        assert_eq!(rec.lock().unwrap().as_slice(), &["c", "b", "a"]);
    }

    #[test]
    fn phases_are_independent() {
        let rec = recorder();
        let tx = Transaction::new();
        let r1 = rec.clone();
        let r2 = rec.clone();
        tx.add_cleanup(CleanupPhase::AfterGameStart, move || push(&r1, "start"));
        tx.add_cleanup(CleanupPhase::AfterGameExit, move || push(&r2, "exit"));

        tx.execute_after_start();
        assert_eq!(rec.lock().unwrap().as_slice(), &["start"]);

        // exit-phase queue is untouched by execute_after_start
        tx.execute_after_exit();
        let order = rec.lock().unwrap().clone();
        assert_eq!(order, &["start", "exit"]);
    }

    #[test]
    fn execute_is_idempotent() {
        // Calling execute twice doesn't replay tasks (mem::take empties the queue).
        let rec = recorder();
        let tx = Transaction::new();
        let r = rec.clone();
        tx.add_cleanup(CleanupPhase::AfterGameStart, move || push(&r, "once"));

        tx.execute_after_start();
        tx.execute_after_start();
        assert_eq!(rec.lock().unwrap().as_slice(), &["once"]);
    }

    #[test]
    fn rollback_runs_both_phases() {
        let rec = recorder();
        let tx = Transaction::new();
        let r1 = rec.clone();
        let r2 = rec.clone();
        tx.add_cleanup(CleanupPhase::AfterGameStart, move || push(&r1, "s"));
        tx.add_cleanup(CleanupPhase::AfterGameExit, move || push(&r2, "e"));

        tx.rollback();
        // start-phase runs first, then exit-phase, each in LIFO.
        assert_eq!(rec.lock().unwrap().as_slice(), &["s", "e"]);
    }

    #[test]
    fn clone_shares_underlying_queue() {
        // Transaction is Clone (Arc-backed); tasks added through a clone
        // must be visible to the original handle.
        let rec = recorder();
        let tx = Transaction::new();
        let tx2 = tx.clone();
        let r = rec.clone();
        tx2.add_cleanup(CleanupPhase::AfterGameExit, move || push(&r, "shared"));

        tx.execute_after_exit();
        assert_eq!(rec.lock().unwrap().as_slice(), &["shared"]);
    }
}

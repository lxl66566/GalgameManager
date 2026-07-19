//! Throttled config persistence.
//!
//! A single background tokio task serialises all non-forced disk writes so
//! that two of them are always spaced at least [`MIN_INTERVAL`] apart. This
//! protects SSD lifespan from accidental write amplification — e.g. when
//! SolidJS reactivity fires several mutations back-to-back, or when several
//! games tick their save timers concurrently — while still guaranteeing that
//! any in-memory change reaches disk within a bounded delay.
//!
//! # Throttle, not trailing debounce
//!
//! Once a flush is scheduled for time `T`, newer `Debounced` requests do
//! **not** push it further back; they are absorbed into the same imminent
//! flush. This is the key difference from a trailing debounce, which could
//! defer writes indefinitely under sustained activity.
//!
//! # Forced writes
//!
//! Critical paths (app exit, remote config apply, game exit) call
//! [`ConfigSaver::force_save_blocking`] which bypasses the throttle entirely
//! and also resets the window so the next regular flush is at least
//! `MIN_INTERVAL` later.

use std::{
    sync::{Arc, OnceLock},
    time::Duration,
};

use config_file2::Storable;
use parking_lot::Mutex;
use tokio::sync::{Notify, mpsc};
// We deliberately use `tokio::time::Instant` (not `std::time::Instant`)
// because tokio's mockable clock under `start_paused` only virtualises the
// tokio variant. Mixing the two would make `last_save` and `sleep_until`
// diverge under tests.
use tokio::time::Instant;

use crate::db::Config;

/// Minimum spacing between two non-forced disk writes. Hard-coded on
/// purpose: this is an internal SSD-protection knob, not a user-tunable.
pub const MIN_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Debug)]
enum SaveRequest {
    /// Throttled save. The writer flushes no later than `MIN_INTERVAL`
    /// after the request, and never more than once per window.
    Debounced { source: &'static str },
}

#[derive(Default)]
struct State {
    /// When the next throttled flush should fire. `None` means no pending
    /// request. Visible in shared state so an external force-save can clear
    /// it via [`ConfigSaver::notify_external_flush`].
    pending_deadline: Option<Instant>,
    /// Most recent source string, used in the flush log line when the
    /// timer fires (we don't otherwise know who requested it).
    last_source: &'static str,
    /// Last successful disk-write timestamp. `None` means "never written
    /// since the saver started"; the first request therefore flushes
    /// immediately.
    last_save: Option<Instant>,
    /// Total number of disk writes performed by the writer task itself.
    /// Excludes external force-saves. For diagnostics / tests.
    save_count: u64,
}

/// Type-erased "give me the current config snapshot" closure. Production
/// locks the global CONFIG; tests return a fresh default.
type SnapshotFn = Arc<dyn Fn() -> Config + Send + Sync>;

/// Type-erased "persist this config" closure. Production wires it to
/// [`Config::store`]; tests count invocations instead of touching the disk.
type StoreFn = Arc<dyn Fn(&Config) -> std::result::Result<(), String> + Send + Sync>;

fn default_snapshot() -> SnapshotFn {
    Arc::new(|| crate::db::CONFIG.lock().clone())
}

fn default_store() -> StoreFn {
    Arc::new(|c: &Config| c.store().map_err(|e| e.to_string()))
}

/// Handle to the background config writer. Cheap to clone.
#[derive(Clone)]
pub struct ConfigSaver {
    tx: mpsc::UnboundedSender<SaveRequest>,
    state: Arc<Mutex<State>>,
    /// Woken whenever `state` is mutated out-of-band (i.e. by
    /// [`ConfigSaver::mark_externally_saved`]) so the writer task can
    /// re-read `pending_deadline` and reschedule its select branches.
    notify: Arc<Notify>,
    snapshot: SnapshotFn,
    store: StoreFn,
}

static CONFIG_SAVER_INNER: OnceLock<ConfigSaver> = OnceLock::new();

impl ConfigSaver {
    /// Spawn the writer task with the default (real) backend. Must be
    /// called inside a tokio runtime context — e.g. from
    /// `tauri::Builder::setup`. The first call installs the global handle
    /// accessible via [`ConfigSaver::get`].
    pub fn init() -> &'static ConfigSaver {
        CONFIG_SAVER_INNER.get_or_init(|| Self::spawn_with(default_snapshot(), default_store()))
    }

    /// Global accessor. Returns `None` before [`init`] has been called.
    pub fn get() -> Option<&'static ConfigSaver> {
        CONFIG_SAVER_INNER.get()
    }

    fn spawn_with(snapshot: SnapshotFn, store: StoreFn) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let state = Arc::new(Mutex::new(State::default()));
        let notify = Arc::new(Notify::new());
        let saver = ConfigSaver {
            tx: tx.clone(),
            state: state.clone(),
            notify: notify.clone(),
            snapshot: snapshot.clone(),
            store: store.clone(),
        };
        // Spawn on the current tokio / tauri runtime. Tauri's async_runtime
        // is just tokio under the hood, but it tolerates being called from
        // the main thread during setup where a raw tokio::spawn might not
        // have an ambient handle yet.
        tauri::async_runtime::spawn(writer_task(rx, state, snapshot, store, notify));
        saver
    }

    /// Request a throttled save. Cheap: one enum over an unbounded channel.
    /// No-op if the global saver has not been installed yet.
    pub fn request(source: &'static str) {
        if let Some(saver) = Self::get() {
            let _ = saver.tx.send(SaveRequest::Debounced { source });
        } else {
            log::warn!("[config-saver] request ignored, saver not initialised (source={source})");
        }
    }

    /// Synchronously persist config to disk *right now*, bypassing the
    /// writer task entirely.
    ///
    /// **Caller must NOT hold the `CONFIG` mutex** — this function will
    /// lock it. Used for critical paths (app exit, remote config apply)
    /// that cannot wait for `MIN_INTERVAL`. Also cancels any pending
    /// throttled flush so we don't rewrite identical content one minute
    /// later.
    pub fn force_save_blocking(source: &'static str) {
        let Some(saver) = Self::get() else {
            // Saver not initialised yet (very early startup or very late
            // shutdown). Fall back to a plain store so we never silently
            // drop a force-save request.
            log::warn!(
                "[config-saver] saver not initialised, falling back to direct store (source={source})"
            );
            let snap = crate::db::CONFIG.lock().clone();
            if let Err(e) = snap.store() {
                log::error!("[config-saver] fallback store failed (source={source}): {e}");
            }
            return;
        };
        let snap = (saver.snapshot)();
        match (saver.store)(&snap) {
            Ok(()) => log::info!("[config-saver] force saved (source={source})"),
            Err(e) => log::error!("[config-saver] force save failed (source={source}): {e}"),
        }
        saver.notify_external_flush();
    }

    /// Tell the writer that an external save just happened *without* going
    /// through this module — e.g. `Config::force_save_and_emit_no_update`
    /// called `Config::store()` while already holding the `CONFIG` mutex.
    ///
    /// This is the lock-safe counterpart to [`force_save_blocking`]: it
    /// does NOT touch CONFIG, so callers may already hold the mutex when
    /// invoking it. Clears any pending throttled flush and restarts the
    /// throttle window so we don't rewrite identical content one minute
    /// later.
    pub fn mark_externally_saved() {
        if let Some(saver) = Self::get() {
            saver.notify_external_flush();
        }
    }

    /// Internal helper: clear pending deadline + restart window + wake the
    /// writer task so it observes the change.
    fn notify_external_flush(&self) {
        {
            let mut st = self.state.lock();
            st.pending_deadline = None;
            st.last_save = Some(Instant::now());
            // Intentionally NOT bumping save_count — that field tracks
            // the writer task's own writes for diagnostics.
        }
        // Wake any select branch parked on the old deadline so the writer
        // re-reads state and parks without a deadline.
        self.notify.notify_one();
    }

    /// Number of disk writes performed by the writer task. Excludes
    /// external force-save calls.
    #[allow(dead_code)]
    pub fn save_count(&self) -> u64 {
        self.state.lock().save_count
    }
}

async fn writer_task(
    mut rx: mpsc::UnboundedReceiver<SaveRequest>,
    state: Arc<Mutex<State>>,
    snapshot: SnapshotFn,
    store: StoreFn,
    notify: Arc<Notify>,
) {
    log::info!("[config-saver] writer task started (min_interval={MIN_INTERVAL:?})");
    let mut next_deadline: Option<Instant> = None;
    loop {
        let deadline = next_deadline;
        tokio::select! {
            req = rx.recv() => match req {
                None => break,
                Some(SaveRequest::Debounced { source }) => {
                    let now = Instant::now();
                    let last_save = state.lock().last_save;
                    let flush_now = last_save.is_none_or(|t| now.duration_since(t) >= MIN_INTERVAL);
                    if flush_now {
                        flush_at(&state, source, &snapshot, &store).await;
                        next_deadline = None;
                    } else {
                        // Schedule a flush at last_save + MIN_INTERVAL.
                        // Key throttle property: do NOT advance an existing
                        // deadline — newer requests are absorbed into the
                        // same imminent flush instead of postponing it.
                        let target = last_save.expect("checked above") + MIN_INTERVAL;
                        {
                            let mut st = state.lock();
                            st.pending_deadline = Some(target);
                            st.last_source = source;
                        }
                        if next_deadline.is_none() {
                            next_deadline = Some(target);
                        }
                    }
                }
            },
            // Drive the scheduled deadline. When none is set this branch
            // parks forever via `pending()`.
            _ = async {
                match deadline {
                    Some(d) => {
                        tokio::time::sleep_until(d).await;
                    }
                    None => std::future::pending::<()>().await,
                }
            } => {
                // Re-check state first: an external flush may have cleared
                // the deadline while we were asleep.
                if state.lock().pending_deadline.is_none() {
                    next_deadline = None;
                    continue;
                }
                let source = state.lock().last_source;
                flush_at(&state, source, &snapshot, &store).await;
                next_deadline = None;
            },
            // Wakeup from `mark_externally_saved` — just loop to re-read.
            _ = notify.notified(), if next_deadline.is_some() => {
                next_deadline = state.lock().pending_deadline;
            }
        }
    }
    log::info!("[config-saver] writer task exited");
}

async fn flush_at(
    state: &Mutex<State>,
    source: &'static str,
    snapshot: &SnapshotFn,
    store: &StoreFn,
) {
    // Clone first, then drop the guard so synchronous file I/O does not
    // block other callers waiting on CONFIG. We deliberately do NOT wrap
    // `store` in `spawn_blocking`: the writer fires at most once per
    // `MIN_INTERVAL` (60 s) and a Config file is typically a few KB, so
    // the synchronous write is short and rare enough that stealing a
    // worker thread is unnecessary — and `spawn_blocking`'s JoinHandle
    // wakeup interacts badly with `tokio::time::pause()` in tests.
    let snap = snapshot();
    let result = store(&snap);
    let mut st = state.lock();
    st.pending_deadline = None;
    st.last_save = Some(Instant::now());
    st.save_count += 1;
    let count = st.save_count;
    drop(st);
    match result {
        Ok(()) => log::info!("[config-saver] saved (source={source}, count={count})"),
        Err(e) => log::error!("[config-saver] store failed (source={source}): {e}"),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    /// Bundle of handles returned by [`spawn_test_writer`].
    struct TestWriter {
        tx: mpsc::UnboundedSender<SaveRequest>,
        state: Arc<Mutex<State>>,
        counter: Arc<AtomicU64>,
        notify: Arc<Notify>,
        handle: tokio::task::JoinHandle<()>,
    }

    /// Spin up a writer task with mock backend.
    fn spawn_test_writer() -> TestWriter {
        let counter = Arc::new(AtomicU64::new(0));
        let counter_clone = counter.clone();
        let store: StoreFn = Arc::new(move |_| {
            counter_clone.fetch_add(1, Ordering::SeqCst);
            Ok(())
        });
        let snapshot: SnapshotFn = Arc::new(Config::default);
        let (tx, rx) = mpsc::unbounded_channel();
        let state = Arc::new(Mutex::new(State::default()));
        let notify = Arc::new(Notify::new());
        let state_for_task = state.clone();
        let notify_for_task = notify.clone();
        let handle = tokio::spawn(writer_task(
            rx,
            state_for_task,
            snapshot,
            store,
            notify_for_task,
        ));
        TestWriter {
            tx,
            state,
            counter,
            notify,
            handle,
        }
    }

    /// Give the task enough turns to process messages *and* let the inner
    /// `spawn_blocking` finish.
    async fn settle() {
        for _ in 0..5 {
            tokio::task::yield_now().await;
        }
    }

    #[tokio::test(start_paused = true)]
    async fn first_request_flushes_immediately() {
        let w = spawn_test_writer();
        w.tx.send(SaveRequest::Debounced { source: "first" })
            .unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);
        assert_eq!(w.state.lock().save_count, 1);
        assert!(w.state.lock().pending_deadline.is_none());
        w.handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn rapid_requests_throttle_into_one_extra_write() {
        let w = spawn_test_writer();

        // First request: immediate flush.
        w.tx.send(SaveRequest::Debounced { source: "r1" }).unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);

        // Burst of requests inside the throttle window — none of them
        // should trigger an immediate write; they get absorbed into a
        // single scheduled flush.
        for _ in 0..5 {
            w.tx.send(SaveRequest::Debounced { source: "burst" })
                .unwrap();
        }
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);
        assert!(w.state.lock().pending_deadline.is_some());

        // Advance virtual time past MIN_INTERVAL: exactly one more write.
        tokio::time::advance(MIN_INTERVAL + Duration::from_millis(1)).await;
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);

        // No further writes after the burst is consumed.
        tokio::time::advance(MIN_INTERVAL * 2).await;
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);
        w.handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn spaced_requests_each_flush_immediately() {
        // If requests are spaced >= MIN_INTERVAL apart, each flushes on
        // arrival — no scheduling, no coalescing.
        let w = spawn_test_writer();

        w.tx.send(SaveRequest::Debounced { source: "a" }).unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);

        tokio::time::advance(MIN_INTERVAL).await;
        w.tx.send(SaveRequest::Debounced { source: "b" }).unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);

        tokio::time::advance(MIN_INTERVAL).await;
        w.tx.send(SaveRequest::Debounced { source: "c" }).unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 3);
        w.handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn notify_external_flush_clears_pending() {
        // Simulate what `ConfigSaver::mark_externally_saved` does: clear
        // the shared deadline and wake the writer so it observes.
        let w = spawn_test_writer();

        w.tx.send(SaveRequest::Debounced { source: "warm" })
            .unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);

        w.tx.send(SaveRequest::Debounced { source: "queued" })
            .unwrap();
        settle().await;
        assert!(w.state.lock().pending_deadline.is_some());

        // Mimic external force-save path.
        {
            let mut st = w.state.lock();
            st.pending_deadline = None;
            st.last_save = Some(Instant::now());
        }
        w.notify.notify_one();
        settle().await;

        tokio::time::advance(MIN_INTERVAL * 3).await;
        settle().await;
        // No additional write — the external flush already covered the
        // queued change.
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);
        w.handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn channel_close_stops_writer() {
        let w = spawn_test_writer();
        drop(w.tx);
        // Writer should exit cleanly once all senders are gone.
        match w.handle.await {
            Ok(()) => {}
            Err(e) => panic!("writer task panicked: {e}"),
        }
    }
}

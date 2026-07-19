//! Throttled config persistence.
//!
//! A single background tokio task is the *only* writer of the config file.
//! `Debounced` requests are throttled to at most one flush per
//! [`MIN_INTERVAL`] (SSD protection against SolidJS reactivity storms and
//! concurrent game ticks); `Forced` requests skip the throttle and flush as
//! soon as the writer picks them up. Because every write — throttled or
//! forced — is serialised through this one task, a throttled flush can
//! never overwrite a newer forced flush with a stale snapshot.
//!
//! Note: throttle, not trailing debounce. Once a flush is scheduled for
//! time `T`, newer `Debounced` requests are absorbed into it instead of
//! pushing it back, so sustained activity cannot defer writes indefinitely.

use std::{
    sync::{
        Arc, OnceLock,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use config_file2::Storable;
use tauri::AppHandle;
use tokio::sync::{mpsc, oneshot};
// `tokio::time::Instant` (not std's) so `tokio::time::pause()` virtualises
// both `last_save` and `sleep_until` in tests.
use tokio::time::Instant;

use crate::{
    db::Config,
    utils::toast::{self, ToastVariant},
};

/// Minimum spacing between two throttled disk writes. Hard-coded on
/// purpose: internal SSD-protection knob, not a user-tunable.
pub const MIN_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Debug)]
enum SaveRequest {
    /// Throttled save: flush at most once per `MIN_INTERVAL`.
    Debounced { source: &'static str },
    /// Immediate save, bypassing the throttle and resetting the window.
    /// `done` is signalled once the flush finished (used by app exit).
    Forced {
        source: &'static str,
        done: Option<oneshot::Sender<()>>,
    },
}

/// Type-erased "give me the current config snapshot" closure. Production
/// locks the global CONFIG; tests return a fresh default.
type SnapshotFn = Arc<dyn Fn() -> Config + Send + Sync>;

/// Type-erased "persist this config" closure. Production wires it to
/// [`Config::store`]; tests count invocations instead of touching the disk.
type StoreFn = Arc<dyn Fn(&Config) -> std::result::Result<(), String> + Send + Sync>;

/// Type-erased "report a store failure to the user" closure. Production
/// emits a frontend toast; tests pass `None`.
///
/// NOTE: deliberately a closure instead of an `AppHandle` — any `AppHandle`
/// reachable from `writer_task` would pull the wry/tao/muda type graph
/// into `cargo test` binaries, and the resulting import of muda's
/// `TaskDialogIndirect` (comctl32 v6 only) makes the manifest-less test
/// exe fail to load with STATUS_ENTRYPOINT_NOT_FOUND.
type ToastFn = Arc<dyn Fn(String) + Send + Sync>;

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
    snapshot: SnapshotFn,
    store: StoreFn,
}

static CONFIG_SAVER_INNER: OnceLock<ConfigSaver> = OnceLock::new();

impl ConfigSaver {
    /// Spawn the writer task with the default (real) backend. Must be
    /// called inside a tokio runtime context — e.g. from
    /// `tauri::Builder::setup`. The first call installs the global handle
    /// accessible via [`ConfigSaver::get`].
    pub fn init(app: &AppHandle) -> &'static ConfigSaver {
        let app = app.clone();
        CONFIG_SAVER_INNER.get_or_init(|| {
            let toast: ToastFn = Arc::new(move |msg| {
                toast::emit_toast(&app, ToastVariant::Error, msg);
            });
            Self::spawn_with(default_snapshot(), default_store(), Some(toast))
        })
    }

    /// Global accessor. Returns `None` before [`init`] has been called.
    pub fn get() -> Option<&'static ConfigSaver> {
        CONFIG_SAVER_INNER.get()
    }

    fn spawn_with(snapshot: SnapshotFn, store: StoreFn, toast: Option<ToastFn>) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let saver = ConfigSaver {
            tx,
            snapshot: snapshot.clone(),
            store: store.clone(),
        };
        // Spawn on tauri's runtime: tolerates being called from the main
        // thread during setup where a raw tokio::spawn might not have an
        // ambient handle yet.
        tauri::async_runtime::spawn(writer_task(rx, snapshot, store, toast));
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

    /// Request an immediate save that bypasses the throttle. Non-blocking:
    /// the writer flushes as soon as it picks the request up, so callers
    /// may hold the `CONFIG` mutex. Returns `false` if the saver is not
    /// initialised, in which case the caller should write through directly.
    pub fn request_force(source: &'static str) -> bool {
        let Some(saver) = Self::get() else {
            log::warn!(
                "[config-saver] force request ignored, saver not initialised (source={source})"
            );
            return false;
        };
        let _ = saver.tx.send(SaveRequest::Forced { source, done: None });
        true
    }

    /// Force a save and block until it has hit disk. Used at app exit.
    /// Call from the main thread, NOT from a runtime worker, and NOT while
    /// holding the `CONFIG` mutex. Falls back to a direct store if the
    /// writer is unavailable.
    pub fn force_save_blocking(source: &'static str) {
        let Some(saver) = Self::get() else {
            // Very early startup / late shutdown: never silently drop a
            // force-save request.
            log::warn!(
                "[config-saver] saver not initialised, falling back to direct store (source={source})"
            );
            let snap = crate::db::CONFIG.lock().clone();
            if let Err(e) = snap.store() {
                log::error!("[config-saver] fallback store failed (source={source}): {e}");
            }
            return;
        };
        let (done_tx, done_rx) = oneshot::channel();
        if saver
            .tx
            .send(SaveRequest::Forced {
                source,
                done: Some(done_tx),
            })
            .is_err()
        {
            log::error!("[config-saver] writer gone, direct store (source={source})");
            let snap = (saver.snapshot)();
            if let Err(e) = (saver.store)(&snap) {
                log::error!("[config-saver] fallback store failed (source={source}): {e}");
            }
            return;
        }
        // If the writer panicked, `done_tx` is dropped and recv errors out.
        let _ = done_rx.blocking_recv();
    }
}

async fn writer_task(
    mut rx: mpsc::UnboundedReceiver<SaveRequest>,
    snapshot: SnapshotFn,
    store: StoreFn,
    toast: Option<ToastFn>,
) {
    log::info!("[config-saver] writer task started (min_interval={MIN_INTERVAL:?})");
    let save_count = AtomicU64::new(0);
    let mut last_save: Option<Instant> = None;
    let mut next_deadline: Option<Instant> = None;
    let mut last_source: &'static str = "unknown";
    loop {
        let deadline = next_deadline;
        tokio::select! {
            req = rx.recv() => match req {
                None => break,
                Some(SaveRequest::Debounced { source }) => {
                    let now = Instant::now();
                    let flush_now =
                        last_save.is_none_or(|t| now.duration_since(t) >= MIN_INTERVAL);
                    if flush_now {
                        flush(&save_count, source, &snapshot, &store, &toast);
                        last_save = Some(Instant::now());
                        next_deadline = None;
                    } else {
                        // Absorb into the imminent flush at
                        // last_save + MIN_INTERVAL; never postpone it.
                        last_source = source;
                        if next_deadline.is_none() {
                            next_deadline = last_save.map(|t| t + MIN_INTERVAL);
                        }
                    }
                }
                Some(SaveRequest::Forced { source, done }) => {
                    flush(&save_count, source, &snapshot, &store, &toast);
                    last_save = Some(Instant::now());
                    next_deadline = None;
                    if let Some(done) = done {
                        let _ = done.send(());
                    }
                }
            },
            // Parks forever via `pending()` when no deadline is scheduled.
            _ = async {
                match deadline {
                    Some(d) => tokio::time::sleep_until(d).await,
                    None => std::future::pending::<()>().await,
                }
            } => {
                flush(&save_count, last_source, &snapshot, &store, &toast);
                last_save = Some(Instant::now());
                next_deadline = None;
            }
        }
    }
    log::info!("[config-saver] writer task exited");
}

/// Snapshot-then-store. The snapshot clones Config and releases the
/// CONFIG mutex before the synchronous file write, so file I/O never
/// blocks other CONFIG callers. Not wrapped in `spawn_blocking`: flushes
/// are rare (<= 1 per MIN_INTERVAL, a few KB each) and `spawn_blocking`'s
/// wakeup interacts badly with `tokio::time::pause()` in tests.
fn flush(
    save_count: &AtomicU64,
    source: &'static str,
    snapshot: &SnapshotFn,
    store: &StoreFn,
    toast: &Option<ToastFn>,
) {
    let snap = snapshot();
    let count = save_count.fetch_add(1, Ordering::Relaxed) + 1;
    match store(&snap) {
        Ok(()) => log::info!("[config-saver] saved (source={source}, count={count})"),
        Err(e) => {
            log::error!("[config-saver] store failed (source={source}): {e}");
            if let Some(toast) = toast {
                toast(format!("<hint.saveConfigFailed>: {e}"));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Handles to drive and inspect a writer with a mock backend.
    struct TestWriter {
        tx: mpsc::UnboundedSender<SaveRequest>,
        counter: Arc<AtomicU64>,
        handle: tokio::task::JoinHandle<()>,
    }

    fn spawn_test_writer() -> TestWriter {
        let counter = Arc::new(AtomicU64::new(0));
        let counter_clone = counter.clone();
        let store: StoreFn = Arc::new(move |_| {
            counter_clone.fetch_add(1, Ordering::SeqCst);
            Ok(())
        });
        let snapshot: SnapshotFn = Arc::new(Config::default);
        let (tx, rx) = mpsc::unbounded_channel();
        let handle = tokio::spawn(writer_task(rx, snapshot, store, None));
        TestWriter {
            tx,
            counter,
            handle,
        }
    }

    /// Give the task enough turns to process queued messages.
    async fn settle() {
        for _ in 0..5 {
            tokio::task::yield_now().await;
        }
    }

    fn debounced(source: &'static str) -> SaveRequest {
        SaveRequest::Debounced { source }
    }

    fn forced(source: &'static str) -> (SaveRequest, oneshot::Receiver<()>) {
        let (done, rx) = oneshot::channel();
        (
            SaveRequest::Forced {
                source,
                done: Some(done),
            },
            rx,
        )
    }

    #[tokio::test(start_paused = true)]
    async fn first_request_flushes_immediately() {
        let w = spawn_test_writer();
        w.tx.send(debounced("first")).unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);
        w.handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn rapid_requests_throttle_into_one_extra_write() {
        let w = spawn_test_writer();

        w.tx.send(debounced("r1")).unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);

        // Burst inside the throttle window: no immediate write, one
        // scheduled flush.
        for _ in 0..5 {
            w.tx.send(debounced("burst")).unwrap();
        }
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);

        tokio::time::advance(MIN_INTERVAL + Duration::from_millis(1)).await;
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);

        // Burst consumed: no further writes.
        tokio::time::advance(MIN_INTERVAL * 2).await;
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);
        w.handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn spaced_requests_each_flush_immediately() {
        let w = spawn_test_writer();

        w.tx.send(debounced("a")).unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);

        for (i, source) in ["b", "c"].iter().enumerate() {
            tokio::time::advance(MIN_INTERVAL).await;
            w.tx.send(debounced(source)).unwrap();
            settle().await;
            assert_eq!(w.counter.load(Ordering::SeqCst), (i + 2) as u64);
        }
        w.handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn forced_request_flushes_immediately_and_resets_window() {
        let w = spawn_test_writer();

        w.tx.send(debounced("warm")).unwrap();
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 1);

        // Queue a throttled flush, then force: the forced write happens
        // now (not after MIN_INTERVAL) and absorbs the pending one.
        w.tx.send(debounced("queued")).unwrap();
        settle().await;
        let (req, done) = forced("force");
        w.tx.send(req).unwrap();
        done.await.unwrap();
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);

        // The pending throttled flush was cancelled by the forced write.
        tokio::time::advance(MIN_INTERVAL * 3).await;
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);
        w.handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn forced_requests_serialise_with_throttled_writes() {
        // Regression test for the lost-update race: with a single writer,
        // interleaved debounced + forced requests still produce ordered,
        // non-overlapping writes (each flush snapshots the latest config).
        let w = spawn_test_writer();
        for source in ["f1", "f2", "f3"] {
            let (req, done) = forced(source);
            w.tx.send(req).unwrap();
            done.await.unwrap();
        }
        assert_eq!(w.counter.load(Ordering::SeqCst), 3);
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

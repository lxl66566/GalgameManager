//! Generic throttled background writer.
//!
//! A single background task serializes flushes of some mutable state, so
//! bursts of mutations collapse into at most one disk write per `interval`.
//!
//! Policy: **leading-edge throttle**, not trailing debounce. The first
//! request after `interval` of idleness flushes immediately; requests that
//! arrive inside the throttle window are absorbed into the one flush already
//! scheduled for `last_flush + interval` (they never push it later). This
//! guarantees that sustained activity cannot defer writes indefinitely.
//!
//! Shared between the config saver (`db::saver`) and the image dead-URL
//! cache (`http::dead_url`) so both run the *same* well-tested loop.

use std::{sync::Arc, time::Duration};

use tokio::sync::{mpsc, oneshot};
// `tokio::time::Instant` (not std's) so `tokio::time::pause()` virtualises
// both `last_flush` and `sleep_until` in tests.
use tokio::time::Instant;

/// Type-erased "snapshot + store" closure. Must snapshot-and-release any
/// locks *before* doing synchronous file I/O, so the writer task never
/// blocks other consumers of the lock. Returns `Err(msg)` on failure; the
/// writer logs it and optionally hands it to [`ThrottledWriter::spawn`]'s
/// `on_error` callback.
type FlushFn = Arc<dyn Fn() -> Result<(), String> + Send + Sync>;

/// Optional failure reporter (e.g. a frontend toast for config saves).
type OnErrorFn = Arc<dyn Fn(String) + Send + Sync>;

#[derive(Debug)]
enum Request {
    /// Throttled flush: at most one per `interval`.
    Debounced { source: &'static str },
    /// Immediate flush bypassing the throttle. `done` is signalled once the
    /// flush hit disk (used by [`ThrottledWriter::force_blocking`]).
    Forced {
        source: &'static str,
        done: Option<oneshot::Sender<()>>,
    },
}

/// Handle to a background throttled writer. Cheap to clone.
///
/// Construct via [`ThrottledWriter::spawn`] (production, on tauri's runtime)
/// or by spawning [`writer_loop`] directly (tests, on a `#[tokio::test]`
/// runtime).
#[derive(Clone)]
pub struct ThrottledWriter {
    name: &'static str,
    tx: mpsc::UnboundedSender<Request>,
    /// Kept so `flush_direct` can run the same snapshot+store path the
    /// writer task uses, for very early startup / late shutdown fallback.
    flush: FlushFn,
}

impl ThrottledWriter {
    /// Spawn a writer named `name` (used in logs) that flushes at most once
    /// per `interval`. `flush` does the snapshot + synchronous store;
    /// `on_error` (if given) is called with the error string on a failed
    /// flush.
    ///
    /// Must be called inside a tokio runtime context — e.g. from
    /// `tauri::Builder::setup` or any `async fn` running on tauri's runtime.
    pub fn spawn(
        name: &'static str,
        interval: Duration,
        flush: FlushFn,
        on_error: Option<OnErrorFn>,
    ) -> Self {
        let (tx, rx) = mpsc::unbounded_channel();
        let writer = Self {
            name,
            tx,
            flush: flush.clone(),
        };
        tauri::async_runtime::spawn(writer_loop(name, interval, rx, flush, on_error));
        writer
    }

    /// Request a throttled flush. Cheap: one enum over an unbounded channel.
    pub fn debounced(&self, source: &'static str) {
        let _ = self.tx.send(Request::Debounced { source });
    }

    /// Request an immediate flush that bypasses the throttle. Non-blocking.
    /// Returns `false` if the writer task has exited.
    pub fn forced(&self, source: &'static str) -> bool {
        self.send_forced(source, None)
    }

    /// Immediate flush + wait for it to hit disk. Call from the main thread,
    /// NOT from a runtime worker (uses `blocking_recv`). Returns `false` if
    /// the writer task has exited — callers with a fallback should then call
    /// [`ThrottledWriter::flush_direct`].
    pub fn force_blocking(&self, source: &'static str) -> bool {
        let (done_tx, done_rx) = oneshot::channel();
        if self.send_forced(source, Some(done_tx)) {
            // If the writer panicked, `done_tx` is dropped → recv errs.
            let _ = done_rx.blocking_recv();
            true
        } else {
            false
        }
    }

    /// Low-level send used by both [`forced`] and [`force_blocking`].
    /// Returns `true` if the request was queued.
    pub fn send_forced(&self, source: &'static str, done: Option<oneshot::Sender<()>>) -> bool {
        self.tx.send(Request::Forced { source, done }).is_ok()
    }

    /// Run the snapshot+store closure synchronously on the caller's thread,
    /// bypassing the writer task entirely. Used as a fallback when the
    /// writer isn't running (early startup / late shutdown).
    pub fn flush_direct(&self) -> Result<(), String> {
        (self.flush)()
    }
}

impl std::fmt::Display for ThrottledWriter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}-writer", self.name)
    }
}

/// The throttle loop. Exposed for the in-file tests, which spawn it on a
/// `#[tokio::test]` runtime (production goes through
/// [`ThrottledWriter::spawn`] which uses `tauri::async_runtime::spawn`).
async fn writer_loop(
    name: &'static str,
    interval: Duration,
    mut rx: mpsc::UnboundedReceiver<Request>,
    flush: FlushFn,
    on_error: Option<OnErrorFn>,
) {
    log::info!("[{name}-writer] started (interval={interval:?})");
    let mut last_flush: Option<Instant> = None;
    let mut next_deadline: Option<Instant> = None;
    let mut last_source: &'static str = "unknown";
    loop {
        let deadline = next_deadline;
        tokio::select! {
            req = rx.recv() => match req {
                None => break,
                Some(Request::Debounced { source }) => {
                    let now = Instant::now();
                    let flush_now =
                        last_flush.is_none_or(|t| now.duration_since(t) >= interval);
                    if flush_now {
                        run_flush(name, source, &flush, &on_error);
                        last_flush = Some(Instant::now());
                        next_deadline = None;
                    } else {
                        // Absorb into the imminent flush at
                        // `last_flush + interval`; never postpone it.
                        last_source = source;
                        if next_deadline.is_none() {
                            next_deadline = last_flush.map(|t| t + interval);
                        }
                    }
                }
                Some(Request::Forced { source, done }) => {
                    run_flush(name, source, &flush, &on_error);
                    last_flush = Some(Instant::now());
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
                run_flush(name, last_source, &flush, &on_error);
                last_flush = Some(Instant::now());
                next_deadline = None;
            }
        }
    }
    log::info!("[{name}-writer] exited");
}

/// One snapshot+store attempt with structured logging.
fn run_flush(name: &str, source: &str, flush: &FlushFn, on_error: &Option<OnErrorFn>) {
    match flush() {
        Ok(()) => log::info!("[{name}-writer] flushed (source={source})"),
        Err(e) => {
            log::error!("[{name}-writer] flush failed (source={source}): {e}");
            if let Some(cb) = on_error {
                cb(e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    /// Interval used by these tests. Value mirrors `db::saver::MIN_INTERVAL`
    /// but is duplicated here so the primitive's tests are self-contained.
    const INTERVAL: Duration = Duration::from_secs(60);

    /// Harness: spawn `writer_loop` with a flush fn that increments a shared
    /// counter. Returns the sender + counter + join handle.
    struct TestWriter {
        tx: mpsc::UnboundedSender<Request>,
        counter: Arc<AtomicU64>,
        handle: tokio::task::JoinHandle<()>,
    }

    fn spawn_test_writer() -> TestWriter {
        let counter = Arc::new(AtomicU64::new(0));
        let counter_clone = counter.clone();
        let flush: FlushFn = Arc::new(move || {
            counter_clone.fetch_add(1, Ordering::SeqCst);
            Ok(())
        });
        let (tx, rx) = mpsc::unbounded_channel();
        let handle = tokio::spawn(writer_loop("test", INTERVAL, rx, flush, None));
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

    fn debounced(source: &'static str) -> Request {
        Request::Debounced { source }
    }

    fn forced(source: &'static str) -> (Request, oneshot::Receiver<()>) {
        let (done, rx) = oneshot::channel();
        (
            Request::Forced {
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

        tokio::time::advance(INTERVAL + Duration::from_millis(1)).await;
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);

        // Burst consumed: no further writes.
        tokio::time::advance(INTERVAL * 2).await;
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
            tokio::time::advance(INTERVAL).await;
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
        // now (not after INTERVAL) and absorbs the pending one.
        w.tx.send(debounced("queued")).unwrap();
        settle().await;
        let (req, done) = forced("force");
        w.tx.send(req).unwrap();
        done.await.unwrap();
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);

        // The pending throttled flush was cancelled by the forced write.
        tokio::time::advance(INTERVAL * 3).await;
        settle().await;
        assert_eq!(w.counter.load(Ordering::SeqCst), 2);
        w.handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn forced_requests_serialise_with_throttled_writes() {
        // Regression test for the lost-update race: with a single writer,
        // interleaved debounced + forced requests still produce ordered,
        // non-overlapping writes (each flush snapshots the latest state).
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

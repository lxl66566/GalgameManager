//! Throttled config persistence.
//!
//! Thin wrapper around [`crate::utils::persist::ThrottledWriter`] that adds
//! config-specific concerns: a global [`OnceLock`] singleton, a
//! snapshot-then-store flush (the snapshot clones Config and releases the
//! `CONFIG` mutex before the synchronous file write), a toast on failure,
//! and a direct-store fallback for very early startup / late shutdown when
//! the writer task isn't running.
//!
//! The throttle loop itself (leading-edge throttle, not trailing debounce)
//! lives in `utils::persist` and is shared with the image dead-URL cache.

use std::{
    sync::{Arc, OnceLock},
    time::Duration,
};

use tauri::AppHandle;
use tokio::sync::oneshot;

use crate::{
    db::Config,
    utils::{
        persist::ThrottledWriter,
        toast::{self, ToastVariant},
    },
};

/// Minimum spacing between two throttled disk writes. Hard-coded on
/// purpose: internal SSD-protection knob, not a user-tunable.
pub const MIN_INTERVAL: Duration = Duration::from_secs(60);

/// Type-erased "give me the current config snapshot" closure. Production
/// locks the global CONFIG; the fallback path uses the same closure.
type SnapshotFn = Arc<dyn Fn() -> Config + Send + Sync>;

/// Type-erased "persist this config" closure. Production wires it to
/// [`Config::store`]; the fallback path uses the same closure.
type StoreFn = Arc<dyn Fn(&Config) -> std::result::Result<(), String> + Send + Sync>;

/// Type-erased "report a store failure to the user" closure. Production
/// emits a frontend toast.
///
/// NOTE: deliberately a closure instead of an `AppHandle` — any `AppHandle`
/// reachable from the writer task would pull the wry/tao/muda type graph
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
    writer: ThrottledWriter,
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
            let snapshot = default_snapshot();
            let store = default_store();
            let toast: ToastFn = Arc::new(move |msg| {
                toast::emit_toast(&app, ToastVariant::Error, msg);
            });

            // The flush closure snapshots (releasing the CONFIG mutex) and
            // then stores — lock ordering identical to the old hand-rolled
            // `flush` helper.
            let snapshot_for_flush = snapshot.clone();
            let store_for_flush = store.clone();
            let flush: Arc<dyn Fn() -> std::result::Result<(), String> + Send + Sync> =
                Arc::new(move || {
                    let snap = snapshot_for_flush();
                    store_for_flush(&snap)
                });

            let writer =
                ThrottledWriter::spawn("config", MIN_INTERVAL, flush, Some(Arc::clone(&toast)));
            ConfigSaver {
                writer,
                snapshot,
                store,
            }
        })
    }

    /// Global accessor. Returns `None` before [`init`] has been called.
    pub fn get() -> Option<&'static ConfigSaver> {
        CONFIG_SAVER_INNER.get()
    }

    /// Request a throttled save. Cheap: a single channel send through the
    /// shared [`ThrottledWriter`] (see [`crate::utils::persist`]). No-op if
    /// the global saver has not been installed yet.
    pub fn request(source: &'static str) {
        if let Some(saver) = Self::get() {
            saver.writer.debounced(source);
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
        saver.writer.forced(source)
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
        if saver.writer.send_forced(source, Some(done_tx)) {
            // If the writer panicked, `done_tx` is dropped and recv errs out.
            let _ = done_rx.blocking_recv();
        } else {
            // Writer task gone: fall back to a direct synchronous store.
            log::error!("[config-saver] writer gone, direct store (source={source})");
            let snap = (saver.snapshot)();
            if let Err(e) = (saver.store)(&snap) {
                log::error!("[config-saver] fallback store failed (source={source}): {e}");
            }
        }
    }
}

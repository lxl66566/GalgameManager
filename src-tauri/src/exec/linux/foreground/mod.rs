//! Foreground-window detection for Linux.
//!
//! Two strategies are wired up today, composed via [`CompositeDetector`]:
//!
//! * [`x11::X11Detector`] — synchronous EWMH query. Works under X11 and
//!   XWayland, but only sees X clients. Always worth trying because the query
//!   is essentially free (one round-trip).
//! * [`atspi::AtspiDetector`] — listens to AT-SPI focus events over D-Bus.
//!   Works on both Wayland and X11 compositors that ship the accessibility
//!   service (GNOME, KDE, ...).
//!
//! ## Extending
//!
//! Future compositor-specific detectors (GNOME Shell D-Bus, KWin
//! scripting, wlr-foreign-toplevel) should implement
//! [`ForegroundDetector`] in their own submodule and register themselves
//! in [`detect`]. The trait is intentionally synchronous — the contract
//! is "best-effort, return `None` if you don't know" — so detectors
//! that need to warm up asynchronously can simply return `None` until
//! their first event arrives.

pub mod atspi;
pub mod x11;

use std::sync::{Arc, OnceLock};

/// Best-effort foreground window detector.
///
/// Implementations should be cheap to query — they're called on every
/// poll tick of the game loop. Blocking I/O is allowed (one D-Bus /
/// X11 round-trip), but spin-waiting is not.
pub trait ForegroundDetector: Send + Sync {
    /// Return the PID owning the currently focused window, or `None`
    /// when unknown. `None` lets the next detector in the composite
    /// chain take over.
    fn focused_pid(&self) -> Option<u32>;
}

/// Tries each inner detector in order, returning the first `Some(pid)`.
///
/// This is what makes the "X11 first, fall back to AT-SPI" composition
/// expressible without changing call sites.
pub struct CompositeDetector {
    inner: Vec<Arc<dyn ForegroundDetector>>,
}

impl CompositeDetector {
    pub fn new(detectors: Vec<Arc<dyn ForegroundDetector>>) -> Self {
        Self { inner: detectors }
    }
}

impl ForegroundDetector for CompositeDetector {
    fn focused_pid(&self) -> Option<u32> {
        for d in &self.inner {
            if let Some(pid) = d.focused_pid() {
                return Some(pid);
            }
        }
        None
    }
}

/// No-op detector — used when nothing else is available so callers can
/// keep working with `precision_mode` enabled (they'll just never report
/// the game as focused).
struct NoopDetector;

impl ForegroundDetector for NoopDetector {
    fn focused_pid(&self) -> Option<u32> {
        None
    }
}

static SHARED: OnceLock<Arc<dyn ForegroundDetector>> = OnceLock::new();

/// Returns the process-wide foreground detector, initializing it on
/// first use. The detector is shared across all concurrently running
/// games so we don't multiply AT-SPI subscriptions.
pub fn shared() -> &'static Arc<dyn ForegroundDetector> {
    SHARED.get_or_init(detect)
}

/// Build the best detector chain for this host.
///
/// Order matters: cheap, fast-path detectors go first so we short-
/// circuit before touching D-Bus.
fn detect() -> Arc<dyn ForegroundDetector> {
    let mut detectors: Vec<Arc<dyn ForegroundDetector>> = Vec::new();

    if let Some(d) = x11::X11Detector::try_init() {
        log::info!("foreground: X11 EWMH detector enabled");
        detectors.push(Arc::new(d));
    }
    if let Some(d) = atspi::AtspiDetector::try_init() {
        log::info!("foreground: AT-SPI focus detector enabled");
        detectors.push(Arc::new(d));
    }

    if detectors.is_empty() {
        log::warn!("foreground: no detector available; precision mode will not count time");
        return Arc::new(NoopDetector);
    }
    Arc::new(CompositeDetector::new(detectors))
}

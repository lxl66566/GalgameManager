//! X11 / XWayland foreground detector.
//!
//! Implements the EWMH dance described by the task:
//!
//! 1. Read `_NET_ACTIVE_WINDOW` on the root window — gives us the XID
//!    of the focused window.
//! 2. Read `_NET_WM_PID` on that window — gives us its PID.
//!
//! Both round-trips happen lazily on each [`focused_pid`] call, so
//! there's no per-instance background task. The connection itself is
//! shared via [`Arc`] so multiple game loops don't reopen the display.

use std::sync::Arc;

use x11rb::connection::Connection as _;
use x11rb::errors::ReplyError;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, GetPropertyReply};
use x11rb::rust_connection::RustConnection;

use super::ForegroundDetector;

/// EWMH-powered foreground detector for X11 / XWayland.
pub struct X11Detector {
    /// Shared so additional logical users don't pay for a second
    /// socket; lifetime is effectively `'static` for the process.
    conn: Arc<RustConnection>,
    root: u32,
    atom_active_window: u32,
    atom_wm_pid: u32,
}

impl X11Detector {
    /// Connect to the default display and pre-resolve the EWMH atoms
    /// we'll need. Returns `None` silently when no X server is
    /// reachable — that's an expected configuration on bare Wayland.
    pub fn try_init() -> Option<Self> {
        // Connecting when `$DISPLAY` is unset returns an error, but
        // checking the env first gives a cleaner signal and lets us
        // skip the syscall entirely.
        std::env::var_os("DISPLAY")?;

        let (conn, screen_num) = match x11rb::connect(None) {
            Ok(c) => c,
            Err(e) => {
                log::debug!("X11: connect failed ({e}); disabling X11 detector");
                return None;
            }
        };

        let root = {
            let setup = conn.setup();
            setup.roots.get(screen_num).map(|s| s.root)?
        };

        let conn = Arc::new(conn);
        let atom_active_window = intern_atom_owned(&conn, b"_NET_ACTIVE_WINDOW")?;
        let atom_wm_pid = intern_atom_owned(&conn, b"_NET_WM_PID")?;

        Some(Self {
            conn,
            root,
            atom_active_window,
            atom_wm_pid,
        })
    }
}

impl ForegroundDetector for X11Detector {
    fn focused_pid(&self) -> Option<u32> {
        // 1. _NET_ACTIVE_WINDOW on the root window returns a single
        // CARDINAL (XID). The spec allows `None` as a sentinel for "no
        // active window"; treat that and the root window itself as
        // unknown so we don't claim ourselves as focused.
        let active = self
            .get_property(self.root, self.atom_active_window, AtomEnum::WINDOW.into())
            .ok()?;
        let win = active.value32()?.next()?;
        if win == 0 || win == self.root {
            return None;
        }

        // 2. _NET_WM_PID on the active window is a single CARDINAL.
        let pid_prop = self
            .get_property(win, self.atom_wm_pid, AtomEnum::CARDINAL.into())
            .ok()?;
        pid_prop.value32()?.next()
    }
}

impl X11Detector {
    /// Thin wrapper around `get_property` for "first u32 of property".
    fn get_property(
        &self,
        window: u32,
        property: u32,
        kind: u32,
    ) -> Result<GetPropertyReply, ReplyError> {
        self.conn.get_property(
            false,
            window,
            property,
            kind,
            0,
            // We only ever need one element. Long-length in x11rb is
            // measured in 4-byte units, so `1` is enough for both XID
            // (CARDINAL=32-bit) and PID (CARDINAL).
            1,
        )?
        .reply()
    }
}

/// Resolve an EWMH atom name to its numeric atom, returning `None` if
/// the intern call fails. Atom intern is one round-trip so we do this
/// once at detector construction.
fn intern_atom_owned(conn: &RustConnection, name: &[u8]) -> Option<u32> {
    conn.intern_atom(false, name)
        .ok()?
        .reply()
        .ok()
        .map(|r| r.atom)
}

//! AT-SPI focus-event listener.
//!
//! On Wayland, X11 (`_NET_ACTIVE_WINDOW`) only sees X clients. AT-SPI
//! has the unique privilege of broadcasting focus changes regardless of
//! the display protocol, which makes it the only general-purpose
//! detector we can use under GNOME/KDE Wayland.
//!
//! ## How it works
//!
//! 1. Connect to the session bus and install a D-Bus match rule for
//!    `org.a11y.atspi.Event.Object.StateChanged:focused`.
//! 2. Whenever such a signal arrives, record the sender's unique bus name and
//!    resolve it to a unix PID via
//!    `org.freedesktop.DBus.GetConnectionUnixProcessID`.
//! 3. Cache that name→PID mapping so subsequent focus events from the same app
//!    are free. The cache is invalidated through `NameOwnerChanged` so we never
//!    serve a stale PID after a process exits.
//!
//! The listener runs on a dedicated OS thread with its own current-
//! thread tokio runtime. State is shared via [`AtomicU32`] +
//! [`HashMap`]; reads from [`ForegroundDetector::focused_pid`] never
//! block.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicU32, Ordering},
    },
};

use futures_util::StreamExt as _;
use parking_lot::Mutex;
use zbus::{
    Connection, MatchRule, MessageStream,
    fdo::DBusProxy,
    message::Type,
    names::{BusName, UniqueName},
    zvariant::OwnedValue,
};

use super::ForegroundDetector;

/// The latest PID we've seen gaining focus. `0` means "unknown".
static FOCUSED_PID: AtomicU32 = AtomicU32::new(0);

/// Per-bus-name PID cache. Invalidation is wired up to
/// `NameOwnerChanged` so dead processes don't poison the cache.
static PID_CACHE: OnceLock<Arc<Mutex<HashMap<String, u32>>>> = OnceLock::new();

/// Latch so we only spawn the listener once per process, regardless of
/// how many games are launched.
static LISTENER_STARTED: OnceLock<()> = OnceLock::new();

pub struct AtspiDetector;

impl AtspiDetector {
    /// Try to start the listener. Returns `None` if the session bus is
    /// unreachable; the caller then falls back to other detectors.
    pub fn try_init() -> Option<Self> {
        // Quick env gate so we don't even attempt a connection inside
        // headless CI / containers.
        if std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_none()
            && !PathBuf::from("/run/user").exists()
        {
            return None;
        }

        // Kick off the listener exactly once.
        LISTENER_STARTED.get_or_init(|| {
            // Dedicated thread with its own current-thread runtime so
            // the listener is independent of tauri's runtime lifecycle.
            let _ = std::thread::Builder::new()
                .name("atspi-focus".into())
                .spawn(run_listener_thread);
        });

        Some(Self)
    }
}

impl ForegroundDetector for AtspiDetector {
    fn focused_pid(&self) -> Option<u32> {
        let pid = FOCUSED_PID.load(Ordering::Relaxed);
        if pid == 0 { None } else { Some(pid) }
    }
}

fn pid_cache() -> &'static Arc<Mutex<HashMap<String, u32>>> {
    PID_CACHE.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn run_listener_thread() {
    let rt = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(e) => {
            log::warn!("AT-SPI: failed to build runtime: {e}");
            return;
        }
    };

    rt.block_on(async move {
        if let Err(e) = run_listener().await {
            log::debug!("AT-SPI listener exited: {e}");
        }
    });
}

async fn run_listener() -> zbus::Result<()> {
    let session = Connection::session().await?;

    // Build the match rule and turn it into a stream in one shot. zbus
    // handles AddMatch/RemoveMatch for us.
    let rule = MatchRule::builder()
        .msg_type(Type::Signal)
        .interface("org.a11y.atspi.Event.Object")?
        .member("StateChanged")?
        .arg(0, "focused")?
        .build();

    let mut stream = MessageStream::for_match_rule(rule, &session, None).await?;

    // Owner-change watcher runs concurrently to evict dead bus names.
    setup_owner_change_watch(&session).await;

    log::info!("AT-SPI listener ready");

    while let Some(msg) = stream.next().await {
        let Ok(msg) = msg else {
            continue;
        };

        // Body is `(siiv)` for StateChanged. arg0 is already constrained
        // to "focused" by the match rule, but AT-SPI emits the signal
        // twice per focus transition (gain=1 / loss=0) — only count
        // gains so we don't flicker.
        let gained: Option<i32> = msg
            .body()
            .deserialize::<(String, i32, i32, OwnedValue)>()
            .ok()
            .map(|(_, detail1, _, _)| detail1);
        if !matches!(gained, Some(1)) {
            continue;
        }

        // Sender is the application's unique bus name (`:1.42`-style).
        let header = msg.header();
        let Some(sender) = header.sender() else {
            continue;
        };
        let sender_str = sender.as_str();

        // Resolve unique name → PID, then publish.
        if let Some(pid) = resolve_pid(&session, sender_str).await {
            FOCUSED_PID.store(pid, Ordering::Relaxed);
        }
    }

    Ok(())
}

/// Resolve a bus name to its unix PID, caching the result.
///
/// Cache hits are O(1) and don't touch D-Bus at all. Cache misses do a
/// single `GetConnectionUnixProcessID` round-trip.
async fn resolve_pid(session: &Connection, bus_name: &str) -> Option<u32> {
    if let Some(pid) = pid_cache().lock().get(bus_name).copied() {
        return Some(pid);
    }

    let proxy = DBusProxy::new(session).await.ok()?;
    // `get_connection_unix_process_id` is typed to take `BusName<'_>`,
    // so we have to convert our `&str`. `try_into` validates the name
    // shape and rejects invalid inputs cleanly.
    let owned_name: BusName<'_> = bus_name.to_string().try_into().ok()?;
    let pid: u32 = proxy
        .get_connection_unix_process_id(owned_name)
        .await
        .ok()
        .filter(|p| *p != 0)?;

    pid_cache().lock().insert(bus_name.to_owned(), pid);
    Some(pid)
}

/// Drop cached PIDs whose bus name has been released. Bus names are
/// recycled frequently (every app start), so without this the cache
/// would slowly fill with stale entries pointing at dead processes.
async fn setup_owner_change_watch(session: &Connection) {
    let Ok(proxy) = DBusProxy::new(session).await else {
        return;
    };

    let cache = pid_cache().clone();
    tokio::spawn(async move {
        let mut events = match proxy.receive_name_owner_changed().await {
            Ok(s) => s,
            Err(e) => {
                log::debug!("AT-SPI: NameOwnerChanged subscribe failed: {e}");
                return;
            }
        };
        while let Some(ev) = events.next().await {
            let Ok(args) = ev.args() else {
                continue;
            };
            // Old owner gone (and no new owner yet) → invalidate.
            let gone: bool = args.old_owner().is_none() && args.new_owner().is_none();
            if gone {
                cache.lock().remove(args.name().as_str());
            }
        }
    });
}

// Re-exported for completeness; the future GNOME/KWin detectors will
// reuse the same conversion helpers.
#[allow(dead_code)]
fn _unique_name_demo(_: &UniqueName<'_>) {}

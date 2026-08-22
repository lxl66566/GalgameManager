//! Dead-URL cache: record image URLs that returned a 4xx so we don't keep
//! hammering the origin on every render / tab switch.
//!
//! Storage: a plain TSV file (`<expiry_unix_secs>\t<url>` per line) next to
//! the cached images, so clearing the image cache also clears this list.
//! Writes go through [`tempfile::NamedTempFile::persist`] (atomic rename)
//! and are *coalesced* by a single [`ThrottledWriter`] — a whole batch of
//! images failing at once (image host down) collapses into one disk write.
//!
//! Expiry is tiered by HTTP status ([`ttl_for_status`]): 429 is rate-limit
//! noise, 404/410 are effectively permanent, other 4xx (401/403/...) may
//! recover. Expired entries are lazily dropped at load and flush time, and
//! treated as alive at lookup time so the URL gets one fresh retry.

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock as Lazy},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use dashmap::DashMap;
use log::warn;
use reqwest::StatusCode;
use tempfile::NamedTempFile;

use crate::{
    error::{Error, ReqwestDetailedError},
    http::IMAGE_CACHE_DIR,
    utils::persist::ThrottledWriter,
};

static DEAD_URLS_FILE: Lazy<PathBuf> = Lazy::new(|| IMAGE_CACHE_DIR.join("dead_urls.txt"));

static DEAD_URLS: Lazy<DashMap<String, u64>> = Lazy::new(|| {
    let map = DashMap::new();
    match load_dead_urls(&DEAD_URLS_FILE) {
        Ok(entries) => {
            let now = now_secs();
            for (url, expiry) in entries {
                if expiry > now {
                    map.insert(url, expiry);
                }
            }
        },
        Err(e) => warn!("Failed to load dead URL cache: {e}"),
    }
    map
});

/// Coalesce burst writes: an image host going down fails N images within
/// seconds, and we only want one disk write for the whole batch.
const DEAD_URL_FLUSH_INTERVAL: Duration = Duration::from_secs(3);

static DEAD_URL_WRITER: Lazy<ThrottledWriter> = Lazy::new(|| {
    ThrottledWriter::spawn(
        "dead-url",
        DEAD_URL_FLUSH_INTERVAL,
        Arc::new(persist_dead_urls),
        None,
    )
});

/// TTL by HTTP status.
///
/// - **429** Too Many Requests: rate limiting — retry soon (5 min).
/// - **404 / 410**: the resource is gone — keep a long window (30 d) but don't permanently burn it
///   (a CDN re-org / re-upload can revive it).
/// - **Other 4xx** (401/403/422/...): may recover (hotlink protection, transient auth) — medium
///   window (24 h).
///
/// Note: 5xx is never marked dead — it's retried by the download layer.
pub(super) fn ttl_for_status(code: StatusCode) -> Duration {
    match code.as_u16() {
        429 => Duration::from_secs(5 * 60),
        404 | 410 => Duration::from_secs(30 * 24 * 60 * 60),
        _ => Duration::from_secs(24 * 60 * 60),
    }
}

/// Monotonic-ish current time as Unix seconds. Clamps to 0 on clock skew
/// (before-epoch), in which case freshly-added entries still get a sane
/// expiry via `saturating_add` in [`mark_url_dead`].
fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// Is `url` known-dead *and* still within its TTL? Expired entries are
/// reported as alive (so the caller retries once) but left in the map —
/// they're reaped in bulk at the next flush.
pub(super) fn is_url_dead(url: &str) -> bool {
    DEAD_URLS
        .get(url)
        .is_some_and(|expiry| *expiry > now_secs())
}

/// Record `url` as dead until `now + ttl_for_status(status)`. Schedules a
/// coalesced flush only when the entry is new or its expiry actually moved
/// (a duplicate 4xx for an already-dead URL is a no-op).
pub(super) fn mark_url_dead(url: &str, status: StatusCode) {
    let expiry = now_secs().saturating_add(ttl_for_status(status).as_secs());
    let changed = match DEAD_URLS.insert(url.to_string(), expiry) {
        None => true,
        Some(old) => old != expiry,
    };
    if changed {
        DEAD_URL_WRITER.debounced("dead-url");
    }
}

/// Extract the HTTP status carried by a network error (if any).
pub(super) fn http_status_of(err: &Error) -> Option<StatusCode> {
    match err {
        Error::Network(ReqwestDetailedError(e)) => e.status(),
        _ => None,
    }
}

/// Snapshot the live entries (dropping expired ones while we're at it) and
/// atomically replace the on-disk file. Best-effort: errors propagate to
/// the writer task's log.
fn persist_dead_urls() -> Result<(), String> {
    let now = now_secs();
    let live: Vec<(String, u64)> = DEAD_URLS
        .iter()
        .filter(|e| *e.value() > now)
        .map(|e| (e.key().clone(), *e.value()))
        .collect();

    let dir = DEAD_URLS_FILE
        .parent()
        .ok_or_else(|| "dead-urls file has no parent dir".to_string())?;
    let mut tmp = NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    for (url, expiry) in &live {
        // `<expiry>\t<url>\n`. URLs in the wild don't contain raw newlines /
        // tabs; if one ever did, the worst case is a garbled line that
        // `parse_dead_urls` silently skips on next load.
        writeln!(tmp, "{expiry}\t{url}").map_err(|e| e.to_string())?;
    }
    tmp.flush().map_err(|e| e.to_string())?;
    tmp.persist(DEAD_URLS_FILE.as_path())
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Read + parse the TSV. Returns an empty vec if the file doesn't exist yet
/// (first run / cache cleared).
fn load_dead_urls(path: &Path) -> std::io::Result<Vec<(String, u64)>> {
    match fs::read_to_string(path) {
        Ok(s) => Ok(parse_dead_urls(&s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(e),
    }
}

/// Parse `<expiry>\t<url>` lines. Malformed lines (empty, no tab, bad
/// number, empty url) are silently skipped — a hand-edited or partially
/// corrupted file must not abort image loading.
fn parse_dead_urls(s: &str) -> Vec<(String, u64)> {
    s.lines()
        .filter_map(|line| {
            let line = line.strip_suffix('\r').unwrap_or(line);
            if line.is_empty() {
                return None;
            }
            let (ts, url) = line.split_once('\t')?;
            let expiry: u64 = ts.trim().parse().ok()?;
            if url.is_empty() {
                return None;
            }
            Some((url.to_string(), expiry))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ttl_for_status_tiers() {
        assert_eq!(
            ttl_for_status(StatusCode::TOO_MANY_REQUESTS),
            Duration::from_secs(5 * 60)
        );
        for code in [StatusCode::NOT_FOUND, StatusCode::GONE] {
            assert_eq!(
                ttl_for_status(code),
                Duration::from_secs(30 * 24 * 60 * 60),
                "expected {code} to be long-TTL"
            );
        }
        // 401 / 403 / 422 / 400 → medium TTL.
        for code in [
            StatusCode::UNAUTHORIZED,
            StatusCode::FORBIDDEN,
            StatusCode::BAD_REQUEST,
            StatusCode::UNPROCESSABLE_ENTITY,
        ] {
            assert_eq!(
                ttl_for_status(code),
                Duration::from_secs(24 * 60 * 60),
                "expected {code} to be medium-TTL"
            );
        }
        // 5xx is never marked dead, but the function is total — pick the
        // medium bucket so a future caller can't panic on it.
        assert_eq!(
            ttl_for_status(StatusCode::INTERNAL_SERVER_ERROR),
            Duration::from_secs(24 * 60 * 60)
        );
    }

    #[test]
    fn parse_round_trip_skips_malformed() {
        let input = "\
1700000000\thttps://a.example/x.png\n\
not-a-number\thttps://b.example/y.png\n\
1700000500\thttps://c.example/z.png\n\
\n\
no-tab-line\n\
1700001000\t\n\
  1700002000 \thttps://d.example/w.png\n\
1700003000\thttps://e.example/v.png\r\n\
";
        let parsed = parse_dead_urls(input);
        // Keeps a, c, d (trim handles the leading spaces on its ts), e.
        // Drops: bad number (b), empty line, no-tab line, empty url.
        let urls: Vec<_> = parsed.iter().map(|(u, _)| u.as_str()).collect();
        assert_eq!(urls, [
            "https://a.example/x.png",
            "https://c.example/z.png",
            "https://d.example/w.png",
            "https://e.example/v.png"
        ]);
        // Timestamps parse correctly, including the trimmed/CR-stripped ones.
        let expiry_e = parsed
            .iter()
            .find(|(u, _)| u == "https://e.example/v.png")
            .map(|(_, t)| *t);
        assert_eq!(expiry_e, Some(1_700_003_000));
    }

    #[test]
    fn parse_empty_string_yields_empty() {
        assert_eq!(parse_dead_urls(""), [] as [(String, u64); 0]);
    }

    /// `persist_dead_urls` writes via `tempfile`; verify the on-disk
    /// format and atomic replace by running it against a throwaway dir /
    /// map. We can't easily redirect the lazy `DEAD_URLS_FILE`, so this
    /// test exercises the parse side of the round-trip against a
    /// hand-built TSV produced by the same format string used in
    /// `persist_dead_urls`.
    #[test]
    fn persist_format_round_trips_through_parser() {
        let now = now_secs();
        let live: Vec<(String, u64)> = vec![
            ("https://a.example/1.png".to_string(), now + 3600),
            ("https://b.example/2.png".to_string(), now + 7200),
        ];
        // Reproduce the exact wire format used by `persist_dead_urls`.
        let mut buf: Vec<u8> = Vec::new();
        for (url, expiry) in &live {
            writeln!(&mut buf, "{expiry}\t{url}").unwrap();
        }
        let s = std::str::from_utf8(&buf).unwrap();
        assert_eq!(parse_dead_urls(s), live);
    }

    #[test]
    fn now_secs_is_recent_unix() {
        let n = now_secs();
        // Sanity: current time is well past 2020-01-01 (1577836800) and
        // fits in u64. Guards against a clock-skew clamp-to-zero regression.
        assert!(
            n > 1_577_836_800,
            "now_secs() returned {n}, expected > 2020"
        );
    }
}

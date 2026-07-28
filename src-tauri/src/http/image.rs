//! Image download machinery: single-flight dedup, retry, hashing, MIME
//! detection. Extracted from `http/mod.rs` so the module root stays a slim
//! orchestration layer.
//!
//! On a 4xx the caller is recorded in the dead-URL cache
//! ([`super::dead_url`]); 5xx and transport errors are retried here.

use std::{fs, sync::LazyLock as Lazy, time::Duration};

use backon::{ExponentialBuilder, Retryable};
use dashmap::{DashMap, mapref::entry::Entry};
use log::{info, warn};
use sha2::{Digest, Sha256};
use tokio::sync::broadcast::{self, error::RecvError};

use super::{IMAGE_CACHE_DIR, IMAGE_CLIENT, dead_url};
use crate::error::{Error, ReqwestDetailedError, Result};

/// Hex length of a cache key produced by [`hash_image`].
pub(super) const HASH_HEX_LEN: usize = 32;

pub(super) fn hash_image(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    hex::encode(hash)[..HASH_HEX_LEN].to_string()
}

/// Validate that `s` is a well-formed cache key. Empty / wrong-length /
/// non-hex strings are rejected.
pub(super) fn is_valid_hash(s: &str) -> bool {
    s.len() == HASH_HEX_LEN && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Detect MIME type from image magic bytes.
pub(super) fn detect_mime(bytes: &[u8]) -> &'static str {
    if bytes.len() < 4 {
        return "application/octet-stream";
    }
    // JPEG: FF D8
    if bytes[0] == 0xff && bytes[1] == 0xd8 {
        return "image/jpeg";
    }
    // PNG: 89 50 4E 47
    if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4e && bytes[3] == 0x47 {
        return "image/png";
    }
    // GIF: 47 49 46
    if bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 {
        return "image/gif";
    }
    // WebP: RIFF....WEBP
    if bytes.len() >= 12 && &bytes[8..12] == b"WEBP" {
        return "image/webp";
    }
    "application/octet-stream"
}

/// In-flight download pool keyed by sha256 (when known) or by URL (fallback
/// when sha256 is `None`, e.g. first load of a config that only has
/// `image_url`).
///
/// Each entry holds a [`broadcast::Sender`] that the leader uses to fan out
/// its result to concurrent subscribers. The leader removes the entry right
/// after sending.
///
/// Late subscribers (those that arrive after the leader has already sent and
/// removed the entry) get [`RecvError::Closed`]; they fall back to the disk
/// fast-path when sha256 is known, or loop once to become the new leader when
/// sha256 is unknown. The race is rare — and self-heals on the next render
/// because the first successful call writes the hash back into the config via
/// `onHashUpdate`, so subsequent calls hit the disk fast-path directly.
static INFLIGHT: Lazy<DashMap<String, broadcast::Sender<Result<String>>>> = Lazy::new(DashMap::new);

/// Single-flight wrapper around the actual HTTP download.
///
/// - If no other task is downloading this key, the current task becomes the **leader**: it performs
///   the HTTP GET, hashes the bytes, writes the cache file, broadcasts the result, removes itself
///   from the pool and returns.
/// - If another task is already downloading the same key, the current task **subscribes** to that
///   task's broadcast and returns the same result without issuing its own HTTP request.
pub(super) async fn download_single_flight(url: &str, sha256: Option<&str>) -> Result<String> {
    // Dedup key: prefer the content hash when known (so two different URLs
    // pointing at the same image share a download), fall back to the URL
    // itself when the hash isn't yet known.
    let key = sha256.map_or_else(|| url.to_string(), String::from);

    loop {
        match INFLIGHT.entry(key.clone()) {
            Entry::Occupied(e) => {
                // Follower: clone the sender, release the entry guard, then
                // await — never hold a DashMap guard across `.await`.
                let mut rx = e.get().subscribe();
                drop(e);
                match rx.recv().await {
                    Ok(r) => return r,
                    Err(RecvError::Closed) => {
                        // Leader finished and removed the entry (and dropped
                        // its sender) before we subscribed. The file is on
                        // disk now if the leader succeeded.
                        if let Some(h) = sha256
                            && IMAGE_CACHE_DIR.join(h).exists()
                        {
                            return Ok(h.to_string());
                        }
                        // sha256 unknown — cannot look up by hash. Loop to
                        // become the new leader (rare race; bounded by the
                        // tiny window between leader's send and remove).
                    },
                    Err(RecvError::Lagged(_)) => {},
                }
            },
            Entry::Vacant(e) => {
                // Leader: install a sender. `insert` consumes the entry
                // guard, so no manual `drop(e)` is needed before awaiting.
                let (tx, _rx) = broadcast::channel::<Result<String>>(1);
                e.insert(tx.clone());

                let result = download_and_cache(url, sha256).await;
                // `send` errs only when there are no receivers — fine to
                // ignore, the result still goes back to our own caller.
                let _ = tx.send(result.clone());
                INFLIGHT.remove(&key);
                return result;
            },
        }
    }
}

/// Perform the real HTTP GET, hash the bytes, and persist into the cache.
///
/// If `expected` is provided and disagrees with the actual content hash, we
/// log a warning but still use the actual hash as the cache key — trusting
/// the bytes over the caller's claim (the caller's value may be stale from
/// sync, or the remote image may have legitimately changed).
async fn download_and_cache(url: &str, expected: Option<&str>) -> Result<String> {
    match download_image(url).await {
        Ok(bytes) => {
            info!("downloaded image: {} ({} bytes)", url, bytes.len());
            let actual = hash_image(&bytes);
            if let Some(exp) = expected
                && exp != actual
            {
                warn!(
                    "[image] sha256 mismatch for {url}: expected {exp}, got {actual}; caching \
                     under actual hash"
                );
            }
            fs::write(IMAGE_CACHE_DIR.join(&actual), &bytes)?;
            Ok(actual)
        },
        Err(e) => {
            // 4xx → record in dead-URL cache (with status-specific TTL). 5xx
            // and transport errors already retried in `download_image` and
            // are deliberately NOT marked dead.
            if let Some(status) = dead_url::http_status_of(&e)
                && status.is_client_error()
            {
                dead_url::mark_url_dead(url, status);
            }
            Err(e)
        },
    }
}

/// Maximum number of retry attempts for a single image download (not counting
/// the initial attempt). Matches the value used by the opendal `RetryLayer`
/// for sync operations, see `sync::RETRY_TIMES`.
const IMAGE_RETRY_TIMES: usize = 3;

/// Upper bound on the exponential backoff between retries.
const IMAGE_RETRY_MAX_DELAY: Duration = Duration::from_secs(5);

/// One attempt to download the image bytes for `url`. Doesn't retry on its
/// own; retry is added by [`download_image`] via `backon`.
async fn download_image_once(url: &str) -> Result<Vec<u8>> {
    // `error_for_status` turns 4xx/5xx responses into `reqwest::Error` (carrying
    // the status code + url), which `From<reqwest::Error>` renders as a clear
    // "HTTP <code> <reason> (client/server error) for <url>" message — instead
    // of silently caching the error body (e.g. a 404 HTML page) as an image.
    let resp = IMAGE_CLIENT.get(url).send().await?.error_for_status()?;
    Ok(resp.bytes().await?.to_vec())
}

/// Download an image with retry. Retries are limited to transient failures
/// (transport errors and HTTP 5xx); 4xx client errors and non-network errors
/// surface immediately. See [`should_retry_image_error`] for the policy.
async fn download_image(url: &str) -> Result<Vec<u8>> {
    (|| async { download_image_once(url).await })
        .retry(
            ExponentialBuilder::default()
                .with_max_times(IMAGE_RETRY_TIMES)
                .with_max_delay(IMAGE_RETRY_MAX_DELAY)
                .with_jitter(),
        )
        .when(should_retry_image_error)
        .notify(|err: &Error, dur: Duration| {
            // The ReqwestDetailedError Display already surfaces URL, status
            // and root cause, so the top-level `Error` Display is enough —
            // no need to flatten the whole chain here.
            log::warn!("[image] retrying download after {dur:?}: {err}");
        })
        .await
}

/// Decide whether an image download error is worth retrying.
///
/// - HTTP 5xx (server errors): retry — the server may recover.
/// - HTTP 4xx (client errors): do not retry — permanent, retrying wastes a request and may hammer
///   the origin.
/// - Transport errors (timeout / connection reset / decode hiccup) have no HTTP status — retry,
///   they're typically transient.
/// - Non-network failures (disk write, etc.) — do not retry.
fn should_retry_image_error(err: &Error) -> bool {
    match err {
        Error::Network(ReqwestDetailedError(e)) => should_retry_for_status(e.status()),
        _ => false,
    }
}

/// Pure part of [`should_retry_image_error`], factored out so it can be
/// exercised by unit tests without constructing a synthetic `reqwest::Error`.
fn should_retry_for_status(status: Option<reqwest::StatusCode>) -> bool {
    match status {
        Some(s) => s.is_server_error(),
        None => true, // transport-level error (no HTTP status at all)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_mime_jpeg() {
        assert_eq!(detect_mime(&[0xff, 0xd8, 0xff, 0xe0]), "image/jpeg");
    }

    #[test]
    fn detect_mime_png() {
        assert_eq!(
            detect_mime(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]),
            "image/png"
        );
    }

    #[test]
    fn detect_mime_gif() {
        assert_eq!(detect_mime(&[0x47, 0x49, 0x46, 0x38]), "image/gif");
    }

    #[test]
    fn detect_mime_webp() {
        // RIFF....WEBP
        let bytes = b"RIFF\x00\x00\x00\x00WEBP";
        assert_eq!(detect_mime(bytes), "image/webp");
    }

    #[test]
    fn detect_mime_too_short_returns_octet_stream() {
        assert_eq!(detect_mime(&[0x00]), "application/octet-stream");
        assert_eq!(detect_mime(&[]), "application/octet-stream");
    }

    #[test]
    fn detect_mime_unknown_magic_returns_octet_stream() {
        // Random bytes that don't match any known magic.
        assert_eq!(
            detect_mime(&[0x12, 0x34, 0x56, 0x78]),
            "application/octet-stream"
        );
    }

    #[test]
    fn detect_mime_webp_needs_full_12_bytes() {
        // Truncated RIFF header that doesn't reach the WEBP marker at [8..12].
        let bytes = b"RIFF\x00\x00\x00\x00XXXX";
        assert_eq!(detect_mime(bytes), "application/octet-stream");
    }

    #[test]
    fn hash_image_is_stable_and_hex() {
        // Deterministic + hex + 32 chars (16-byte / 64-bit truncated hash).
        let h1 = hash_image(b"abc");
        let h2 = hash_image(b"abc");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), HASH_HEX_LEN);
        assert!(h1.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn is_valid_hash_accepts_real_hash() {
        let h = hash_image(b"abc");
        assert!(is_valid_hash(&h));
    }

    #[test]
    fn is_valid_hash_rejects_empty_string() {
        // The bug fix: an empty `hash` previously made `PathBuf::join("")`
        // resolve to the cache directory itself, which `.exists()` -> bogus
        // cache hit returning "".
        assert!(!is_valid_hash(""));
    }

    #[test]
    fn is_valid_hash_rejects_wrong_length() {
        let too_short = "abc123";
        let too_long = "a".repeat(HASH_HEX_LEN + 1);
        assert!(!is_valid_hash(too_short));
        assert!(!is_valid_hash(&too_long));
    }

    #[test]
    fn is_valid_hash_rejects_non_hex() {
        // 32 chars but contains non-hex characters.
        let bad = "z".repeat(HASH_HEX_LEN);
        assert!(!is_valid_hash(&bad));
        // Note: uppercase hex (A-F) IS valid — `is_ascii_hexdigit` accepts
        // both cases. We never produce uppercase from `hash_image`, but a
        // manually-edited cache file could in principle be named with
        // uppercase; the protocol handler accepts it, so we do too.
        let upper = "A".repeat(HASH_HEX_LEN);
        assert!(is_valid_hash(&upper));
    }

    #[test]
    fn should_retry_tests() {
        // No HTTP status -> transport error (timeout / connection reset) ->
        // always retry.
        assert!(should_retry_for_status(None));

        for code in [500, 502, 503, 504] {
            let status = reqwest::StatusCode::from_u16(code).unwrap();
            assert!(
                should_retry_for_status(Some(status)),
                "expected {code} to be retryable"
            );
        }

        // 4xx client errors are permanent — retrying just hammers the origin.
        for code in [400, 401, 403, 404, 410, 422] {
            let status = reqwest::StatusCode::from_u16(code).unwrap();
            assert!(
                !should_retry_for_status(Some(status)),
                "expected {code} to NOT be retryable"
            );
        }

        // Defensive: 2xx shouldn't reach the retry path, but if it does we
        // shouldn't retry (and the error_for_status wouldn't have produced
        // such an error in the first place).
        let status = reqwest::StatusCode::OK;
        assert!(!should_retry_for_status(Some(status)));
    }
}

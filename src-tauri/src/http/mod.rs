use std::{fs, path::PathBuf, sync::LazyLock as Lazy, time::Duration};

use dashmap::{DashMap, mapref::entry::Entry};
use log::{debug, info, warn};
use reqwest::{Client, header};
use sha2::{Digest, Sha256};
use tauri::http::Response;
use tokio::sync::broadcast::{self, error::RecvError};

use crate::error::Result;

/// Hex length of a cache key produced by [`hash_image`].
pub(crate) const HASH_HEX_LEN: usize = 32;

pub static CACHE_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let dir = home::home_dir()
        .expect("cannot find home dir on your OS!")
        .join(".cache")
        .join(env!("CARGO_PKG_NAME"));
    _ = fs::create_dir_all(&dir);
    dir
});

pub static IMAGE_CACHE_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let dir = CACHE_DIR.join("images");
    _ = fs::create_dir_all(&dir);
    dir
});

static USER_AGENT: &str = "github:lxl66566/GalgameManager";

pub static IMAGE_CLIENT: Lazy<Client> = Lazy::new(|| {
    let mut header_map = header::HeaderMap::with_capacity(1);
    header_map.insert(
        header::USER_AGENT,
        header::HeaderValue::from_static(USER_AGENT),
    );
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .default_headers(header_map)
        .build()
        .unwrap()
});

fn hash_image(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    hex::encode(hash)[..HASH_HEX_LEN].to_string()
}

/// Validate that `s` is a well-formed cache key. Empty / wrong-length /
/// non-hex strings are rejected.
fn is_valid_hash(s: &str) -> bool {
    s.len() == HASH_HEX_LEN && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Detect MIME type from image magic bytes.
fn detect_mime(bytes: &[u8]) -> &'static str {
    if bytes.len() < 4 {
        return "application/octet-stream";
    }
    // JPEG: FF D8
    if bytes[0] == 0xFF && bytes[1] == 0xD8 {
        return "image/jpeg";
    }
    // PNG: 89 50 4E 47
    if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 {
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

/// Prepare an image: download (if URL) and cache to disk, returning the content
/// hash. The image can then be served via the `galimg` custom protocol.
///
/// Flow:
/// 1. **Disk fast-path**: if a valid `sha256` is provided and a cache file by
///    that name exists, return immediately.
/// 2. **Local file path**: any non-`http` argument is read from disk and
///    (re-)hashed.
/// 3. **Remote URL single-flight**: see [`download_single_flight`].
pub async fn prepare_image(path_or_url: &str, sha256: Option<&str>) -> Result<String> {
    debug!("prepare image: {}, sha256: {:?}", path_or_url, sha256);
    let sha256 = sha256.filter(|s| is_valid_hash(s));

    // 1. Fast path: cache file already exists.
    if let Some(h) = sha256 {
        let cache_path = IMAGE_CACHE_DIR.join(h);
        if cache_path.exists() {
            debug!("image cache hit: {}", cache_path.display());
            return Ok(h.to_string());
        }
    }

    // 2. Local file: read, (re-)hash, copy into the cache.
    if !path_or_url.starts_with("http") {
        let bytes = fs::read(path_or_url)?;
        // Prefer a caller-provided valid hash when available; otherwise
        // recompute from content so the cached filename matches what
        // `galimg://` will later request.
        let h = sha256
            .map(String::from)
            .unwrap_or_else(|| hash_image(&bytes));
        fs::write(IMAGE_CACHE_DIR.join(&h), &bytes)?;
        return Ok(h);
    }

    // 3. Remote URL: single-flight dedup.
    download_single_flight(path_or_url, sha256).await
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
/// - If no other task is downloading this key, the current task becomes the
///   **leader**: it performs the HTTP GET, hashes the bytes, writes the cache
///   file, broadcasts the result, removes itself from the pool and returns.
/// - If another task is already downloading the same key, the current task
///   **subscribes** to that task's broadcast and returns the same result
///   without issuing its own HTTP request.
async fn download_single_flight(url: &str, sha256: Option<&str>) -> Result<String> {
    // Dedup key: prefer the content hash when known (so two different URLs
    // pointing at the same image share a download), fall back to the URL
    // itself when the hash isn't yet known.
    let key = sha256.map(String::from).unwrap_or_else(|| url.to_string());

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
                        continue;
                    }
                    Err(RecvError::Lagged(_)) => continue,
                }
            }
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
            }
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
    let bytes = download_image(url).await?;
    info!("downloaded image: {} ({} bytes)", url, bytes.len());
    let actual = hash_image(&bytes);
    if let Some(exp) = expected
        && exp != actual
    {
        warn!(
            "[image] sha256 mismatch for {url}: expected {exp}, got {actual}; \
             caching under actual hash"
        );
    }
    fs::write(IMAGE_CACHE_DIR.join(&actual), &bytes)?;
    Ok(actual)
}

/// Handler for the `galimg` custom URI scheme.
/// Serves cached images from [`IMAGE_CACHE_DIR`] by hash.
pub(crate) fn image_protocol_handler(request: tauri::http::Request<Vec<u8>>) -> Response<Vec<u8>> {
    let hash = request.uri().path().trim_start_matches('/');

    // Reject anything that isn't a well-formed cache key. Without this, an
    // empty `hash` would resolve to the cache directory itself (read errors,
    // but more importantly it leaks filesystem structure to the webview).
    if !is_valid_hash(hash) {
        return Response::builder()
            .status(tauri::http::StatusCode::BAD_REQUEST)
            .body(Vec::new())
            .unwrap();
    }

    match fs::read(IMAGE_CACHE_DIR.join(hash)) {
        Ok(bytes) => {
            let mime = detect_mime(&bytes);
            Response::builder()
                .status(tauri::http::StatusCode::OK)
                .header("Content-Type", mime)
                .header("Cache-Control", "public, max-age=31536000, immutable")
                // Allow fetch() from the app origin: the statistics page reads
                // image bytes into a canvas to extract the dominant color.
                .header("Access-Control-Allow-Origin", "*")
                .body(bytes)
                .unwrap()
        }
        Err(_) => Response::builder()
            .status(tauri::http::StatusCode::NOT_FOUND)
            .body(Vec::new())
            .unwrap(),
    }
}

async fn download_image(url: &str) -> Result<Vec<u8>> {
    // `error_for_status` turns 4xx/5xx responses into `reqwest::Error` (carrying
    // the status code + url), which `From<reqwest::Error>` renders as a clear
    // "HTTP <code> <reason> (client/server error) for <url>" message — instead
    // of silently caching the error body (e.g. a 404 HTML page) as an image.
    let resp = IMAGE_CLIENT.get(url).send().await?.error_for_status()?;
    Ok(resp.bytes().await?.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_mime_jpeg() {
        assert_eq!(detect_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), "image/jpeg");
    }

    #[test]
    fn detect_mime_png() {
        assert_eq!(
            detect_mime(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]),
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
}

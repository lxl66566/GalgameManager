use std::{
    fs,
    path::PathBuf,
    sync::{Arc, LazyLock as Lazy},
    time::Duration,
};

use dashmap::DashMap;
use log::{debug, info};
use reqwest::{Client, header};
use sha2::{Digest, Sha256};
use tauri::http::Response;
use tokio::sync::Mutex as AsyncMutex;

use crate::error::Result;

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
    hex::encode(hash)[..32].to_string()
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
pub async fn prepare_image(path_or_url: &str, hash: Option<&str>) -> Result<String> {
    debug!("prepare image: {}, hash: {:?}", path_or_url, hash);

    // Fast path: cache file already exists
    if let Some(hash) = hash {
        let cache_path = IMAGE_CACHE_DIR.join(hash);
        if cache_path.exists() {
            debug!("image cache hit: {}", cache_path.display());
            return Ok(hash.to_string());
        }
    }

    if !path_or_url.starts_with("http") {
        // Local file: nothing to dedup — read bytes and (re)hash.
        let bytes = fs::read(path_or_url)?;
        // For local files prefer the provided hash when available, otherwise
        // recompute from content.
        let hash = if let Some(hash) = hash {
            hash.to_string()
        } else {
            hash_image(&bytes)
        };
        fs::write(IMAGE_CACHE_DIR.join(&hash), &bytes)?;
        return Ok(hash);
    }

    // Remote URL: single-flight so that N concurrent calls for the same URL
    // share a single HTTP download. This happens in practice when the
    // virtualized grid remounts the same card several times during the startup
    // layout storm (columns/scrollWidth changing as CSS loads) — each remount
    // issues a fresh `prepare_image` before the first one has finished and
    // propagated its hash back to the store.
    download_single_flight(path_or_url).await
}

/// Per-URL in-flight download dedup. Maps URL -> shared slot.
///
/// The slot is an async mutex guarding an optional resolved content hash:
/// - `None`  -> no successful download yet for this URL (holder should
///   download)
/// - `Some`  -> resolved hash from a finished download (returnable to
///   followers)
///
/// The leader (first acquirer finding `None`) performs the HTTP fetch, writes
/// the cache file and stores the hash. Concurrent/following callers that lock
/// the same slot simply return the stored hash without re-downloading.
///
/// Entries are kept for the session as a small URL->hash cache (bounded by the
/// number of distinct image URLs, i.e. the number of games); a missing disk
/// file invalidates the cached entry so a manually-cleared cache is re-fetched.
/// On a failed download the slot stays `None`, so waiters retry (serialized) —
/// acceptable since image failures are rare.
static INFLIGHT_DOWNLOADS: Lazy<DashMap<String, Arc<AsyncMutex<Option<String>>>>> =
    Lazy::new(DashMap::new);

async fn download_single_flight(url: &str) -> Result<String> {
    // Clone the Arc out of the DashMap without holding the entry guard across
    // the await below.
    let slot: Arc<AsyncMutex<Option<String>>> = INFLIGHT_DOWNLOADS
        .entry(url.to_string())
        .or_insert_with(|| Arc::new(AsyncMutex::new(None)))
        .value()
        .clone();

    let mut guard = slot.lock().await;

    // A previous caller may have already finished this download.
    if let Some(resolved) = guard.as_ref() {
        if IMAGE_CACHE_DIR.join(resolved).exists() {
            debug!("image download shared (single-flight): {}", url);
            return Ok(resolved.clone());
        }
        // Disk cache vanished (e.g. manually cleared) — invalidate and retry.
        *guard = None;
    }

    // We are the leader: actually download.
    let bytes = download_image(url).await?;
    info!("downloaded image: {}", url);
    let resolved = hash_image(&bytes);
    fs::write(IMAGE_CACHE_DIR.join(&resolved), &bytes)?;
    *guard = Some(resolved.clone());
    Ok(resolved)
}

/// Handler for the `galimg` custom URI scheme.
/// Serves cached images from [`IMAGE_CACHE_DIR`] by hash.
pub(crate) fn image_protocol_handler(request: tauri::http::Request<Vec<u8>>) -> Response<Vec<u8>> {
    let hash = request.uri().path().trim_start_matches('/');

    // Validate: hash consists of hex characters only
    if hash.is_empty() || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
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
        assert_eq!(h1.len(), 32);
        assert!(h1.chars().all(|c| c.is_ascii_hexdigit()));
    }
}

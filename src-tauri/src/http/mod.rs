//! Image cache + remote download.
//!
//! This module root is a slim orchestration layer: it owns the cache
//! directories, the shared HTTP client, and the public entry points
//! ([`prepare_image`] and [`image_protocol_handler`]). The heavy lifting —
//! single-flight download / retry / hashing — lives in [`image`], and the
//! 4xx dead-URL cache lives in [`dead_url`].

mod dead_url;
mod image;

use std::{fs, path::PathBuf, sync::LazyLock as Lazy, time::Duration};

use dead_url::is_url_dead;
use image::{detect_mime, download_single_flight, hash_image, is_valid_hash};
use log::debug;
use reqwest::{Client, header};

use crate::error::{Error, Result};

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

/// Prepare an image: download (if URL) and cache to disk, returning the content
/// hash. The image can then be served via the `galimg` custom protocol.
///
/// Flow:
/// 1. **Disk fast-path**: if a valid `sha256` is provided and a cache file by that name exists,
///    return immediately.
/// 2. **Local file path**: any non-`http` argument is read from disk and (re-)hashed.
/// 3. **Remote URL single-flight**: see [`image::download_single_flight`].
pub async fn prepare_image(path_or_url: &str, sha256: Option<&str>) -> Result<String> {
    debug!("prepare image: {path_or_url}, sha256: {sha256:?}");
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
        let h = sha256.map_or_else(|| hash_image(&bytes), String::from);
        fs::write(IMAGE_CACHE_DIR.join(&h), &bytes)?;
        return Ok(h);
    }

    // 3. Remote URL: check dead-URL cache first, then single-flight dedup.
    if is_url_dead(path_or_url) {
        return Err(Error::DeadUrl(path_or_url.to_string()));
    }
    download_single_flight(path_or_url, sha256).await
}

/// Handler for the `galimg` custom URI scheme.
/// Serves cached images from [`IMAGE_CACHE_DIR`] by hash.
// Signature dictated by tauri's `register_uri_scheme_protocol` API.
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn image_protocol_handler(
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let hash = request.uri().path().trim_start_matches('/');

    // Reject anything that isn't a well-formed cache key. Without this, an
    // empty `hash` would resolve to the cache directory itself (read errors,
    // but more importantly it leaks filesystem structure to the webview).
    if !is_valid_hash(hash) {
        return tauri::http::Response::builder()
            .status(tauri::http::StatusCode::BAD_REQUEST)
            .body(Vec::new())
            .unwrap();
    }

    match fs::read(IMAGE_CACHE_DIR.join(hash)) {
        Ok(bytes) => {
            let mime = detect_mime(&bytes);
            tauri::http::Response::builder()
                .status(tauri::http::StatusCode::OK)
                .header("Content-Type", mime)
                .header("Cache-Control", "public, max-age=31536000, immutable")
                // Allow fetch() from the app origin: the statistics page reads
                // image bytes into a canvas to extract the dominant color.
                .header("Access-Control-Allow-Origin", "*")
                .body(bytes)
                .unwrap()
        },
        Err(_) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::NOT_FOUND)
            .body(Vec::new())
            .unwrap(),
    }
}

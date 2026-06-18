use std::{fs, path::PathBuf, sync::LazyLock as Lazy, time::Duration};

use log::{debug, info};
use reqwest::{Client, header};
use sha2::{Digest, Sha256};
use tauri::http::Response;

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
        .connect_timeout(Duration::from_secs(3))
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

    // Fetch bytes from URL or local filesystem
    let bytes = if path_or_url.starts_with("http") {
        let data = download_image(path_or_url).await?;
        info!("downloaded image: {}", path_or_url);
        data
    } else {
        fs::read(path_or_url)?
    };

    // For URLs always recompute hash from content; for local files prefer provided
    // hash
    let hash = if !path_or_url.starts_with("http")
        && let Some(hash) = hash
    {
        hash.to_string()
    } else {
        hash_image(&bytes)
    };

    fs::write(IMAGE_CACHE_DIR.join(&hash), &bytes)?;
    Ok(hash)
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
                .body(bytes)
                .unwrap()
        }
        Err(_) => Response::builder()
            .status(tauri::http::StatusCode::NOT_FOUND)
            .body(Vec::new())
            .unwrap(),
    }
}

async fn download_image(url: &str) -> std::result::Result<Vec<u8>, reqwest::Error> {
    Ok(IMAGE_CLIENT.get(url).send().await?.bytes().await?.to_vec())
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

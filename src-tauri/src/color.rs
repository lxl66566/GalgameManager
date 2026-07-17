//! Cover-art accent color extraction.
//!
//! Two public entry points:
//! - [`prepare_image`] wraps [`crate::http::prepare_image`] and, on demand,
//!   derives a color from the just-cached image. This piggybacks on the
//!   existing image-prep IPC so the frontend never needs a second round-trip
//!   just to get a color.
//! - [`extract_color`] is the pure, deterministic color-from-bytes function.
//!
//! The extractor is fully deterministic: identical image bytes always produce
//! the same color (unlike quantization-based extractors such as
//! `@material/material-color-utilities`, whose result depends on element
//! ordering). Strategy, all in HSL space, no quantization:
//!
//! 1. Decode the image and stride-sample at most ~4k opaque pixels.
//! 2. Accumulate a saturation-weighted circular mean of the hue, plus the
//!    weighted means of S and L. Saturation weighting lets colorful regions
//!    dominate the average, while gray/white/black cover backgrounds (whose hue
//!    is numerically arbitrary) contribute nothing — the result tracks the
//!    artwork's actual palette instead of a murky mud.
//! 3. Clamp S and L into bands that read well on both light and dark themes, so
//!    the color is neither neon nor invisible.

use std::{f64::consts::PI, fs};

use crate::{error::Result, http::IMAGE_CACHE_DIR};

/// Resolve an image's cache hash and, on demand, derive its accent color.
///
/// This is a thin wrapper around [`crate::http::prepare_image`] (which
/// downloads/caches the image) that additionally reads the cached file back
/// and extracts a dominant color when `need_color` is true. The caller —
/// typically `CachedImage` — passes `need_color = !game.cover_color`, so each
/// image is decoded at most once across the app's lifetime and there is no
/// separate IPC just for color derivation.
///
/// Returns `(hash, color)` where `color` is `None` when `need_color` was
/// false or extraction failed (the image still loads normally either way —
/// color derivation is best-effort).
pub async fn prepare_image(
    path_or_url: &str,
    hash: Option<&str>,
    need_color: bool,
) -> Result<(String, Option<String>)> {
    let resolved = crate::http::prepare_image(path_or_url, hash).await?;
    let color = if need_color {
        compute_color(&resolved).await
    } else {
        None
    };
    Ok((resolved, color))
}

/// Read a cached image by hash off-thread and extract its accent color.
/// Failures (missing file, decode error) yield `None` — never propagate, so
/// a transient I/O hiccup can't break image display.
async fn compute_color(hash: &str) -> Option<String> {
    let hash = hash.to_string();
    match tauri::async_runtime::spawn_blocking(move || {
        fs::read(IMAGE_CACHE_DIR.join(&hash))
            .ok()
            .and_then(|bytes| extract_color(&bytes))
    })
    .await
    {
        Ok(color) => color,
        Err(e) => {
            log::warn!("[color] compute task failed: {e}");
            None
        }
    }
}

/// Extract a chart-friendly "#RRGGBB" accent color from image bytes.
///
/// Returns `None` if the bytes cannot be decoded or the image has too little
/// chroma to yield a meaningful hue.
pub fn extract_color(bytes: &[u8]) -> Option<String> {
    let img = image::load_from_memory(bytes).ok()?.into_rgba8();
    let (w, h) = (img.width() as usize, img.height() as usize);
    if w == 0 || h == 0 {
        return None;
    }
    let raw = img.as_raw();
    let n = w * h;

    // Stride so we sample at most ~4096 pixels regardless of source size —
    // plenty of statistical mass for a stable mean, cheap on multi-megapixel
    // covers. Sampling is deterministic because the stride is fixed per size.
    let stride = ((n as f64 / 4096.0).sqrt().ceil() as usize).max(1);

    let mut total = 0usize;
    let mut sum_w = 0.0; // weight = saturation × lightness-tent
    let mut sum_cos = 0.0; // weighted hue vector (x)
    let mut sum_sin = 0.0; // weighted hue vector (y)
    let mut sum_s = 0.0;
    let mut sum_l = 0.0;

    for idx in (0..n).step_by(stride) {
        let off = idx * 4;
        if raw[off + 3] < 128 {
            continue; // skip (near-)transparent pixels
        }
        let r = raw[off] as f64 / 255.0;
        let g = raw[off + 1] as f64 / 255.0;
        let b = raw[off + 2] as f64 / 255.0;
        let (hue, s, l) = rgb_to_hsl(r, g, b);

        // Tent peaking at L=0.5 — pure black / pure white (cover letterbox
        // borders, page backgrounds) get zero weight.
        let l_weight = 1.0 - (2.0 * l - 1.0).abs();
        // The hue of a near-gray pixel is numerically arbitrary; only let
        // chromatic pixels steer the circular mean.
        let w = s * l_weight;

        total += 1;
        sum_w += w;
        if w > 0.0 {
            let rad = hue * PI / 180.0;
            sum_cos += w * rad.cos();
            sum_sin += w * rad.sin();
            sum_s += w * s;
            sum_l += w * l;
        }
    }

    if total == 0 || sum_w < (total as f64) * 0.02 {
        // Essentially grayscale — let the caller use a non-image fallback.
        return None;
    }

    let mut hue = sum_sin.atan2(sum_cos).to_degrees();
    if hue < 0.0 {
        hue += 360.0;
    }
    // Clamp into readable bands: vivid enough to distinguish series on a
    // chart, soft enough not to clash with either UI theme.
    let sat = (sum_s / sum_w).clamp(0.35, 0.68);
    let light = (sum_l / sum_w).clamp(0.42, 0.62);

    let (r, g, b) = hsl_to_rgb(hue, sat, light);
    Some(format!(
        "#{:02x}{:02x}{:02x}",
        (r * 255.0).round() as u8,
        (g * 255.0).round() as u8,
        (b * 255.0).round() as u8
    ))
}

/// Convert linear RGB (each channel in `[0,1]`) to HSL.
/// Returns `(hue_degrees in [0,360), saturation in [0,1], lightness in [0,1])`.
fn rgb_to_hsl(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    let d = max - min;
    if d == 0.0 {
        return (0.0, 0.0, l);
    }
    let s = d / (1.0 - (2.0 * l - 1.0).abs());
    let h = if max == r {
        ((g - b) / d).rem_euclid(6.0)
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    let mut hue = h * 60.0;
    if hue < 0.0 {
        hue += 360.0;
    }
    (hue, s, l)
}

/// Convert HSL back to linear RGB (each channel in `[0,1]`).
fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (f64, f64, f64) {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let h_prime = h / 60.0;
    let x = c * (1.0 - (h_prime % 2.0 - 1.0).abs());
    let (r1, g1, b1) = match h_prime as i32 {
        0 | 6 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x), // h_prime in [5,6)
    };
    let m = l - c / 2.0;
    (r1 + m, g1 + m, b1 + m)
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use image::{DynamicImage, ImageBuffer, Rgba};

    use super::*;

    /// Encode a single-color RGBA image as PNG bytes.
    fn png_bytes(w: u32, h: u32, pixel: Rgba<u8>) -> Vec<u8> {
        let img = ImageBuffer::from_pixel(w, h, pixel);
        let mut buf = Vec::new();
        DynamicImage::ImageRgba8(img)
            .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
            .unwrap();
        buf
    }

    fn channels(hex: &str) -> (u8, u8, u8) {
        let r = u8::from_str_radix(&hex[1..3], 16).unwrap();
        let g = u8::from_str_radix(&hex[3..5], 16).unwrap();
        let b = u8::from_str_radix(&hex[5..7], 16).unwrap();
        (r, g, b)
    }

    #[test]
    fn red_image_is_red_dominant() {
        let bytes = png_bytes(64, 64, Rgba([220, 40, 40, 255]));
        let c = extract_color(&bytes).expect("red image should yield a color");
        let (r, g, b) = channels(&c);
        assert!(r > g && r > b, "expected red-dominant, got {c}");
    }

    #[test]
    fn blue_image_is_blue_dominant() {
        let bytes = png_bytes(64, 64, Rgba([40, 80, 220, 255]));
        let c = extract_color(&bytes).expect("blue image should yield a color");
        let (r, g, b) = channels(&c);
        assert!(b > r && b > g, "expected blue-dominant, got {c}");
    }

    #[test]
    fn deterministic_across_calls() {
        let bytes = png_bytes(48, 48, Rgba([120, 200, 60, 255]));
        assert_eq!(extract_color(&bytes), extract_color(&bytes));
    }

    #[test]
    fn deterministic_across_sizes() {
        // The same color at different resolutions must yield the same hex —
        // otherwise a re-encoded cover would randomly shift the chart color.
        let a = extract_color(&png_bytes(32, 32, Rgba([200, 100, 30, 255]))).unwrap();
        let b = extract_color(&png_bytes(256, 256, Rgba([200, 100, 30, 255]))).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn grayscale_returns_none() {
        let bytes = png_bytes(32, 32, Rgba([128, 128, 128, 255]));
        assert!(extract_color(&bytes).is_none());
    }

    #[test]
    fn fully_transparent_returns_none() {
        let bytes = png_bytes(32, 32, Rgba([100, 50, 200, 0]));
        assert!(extract_color(&bytes).is_none());
    }

    #[test]
    fn corrupt_bytes_return_none() {
        assert!(extract_color(b"not an image").is_none());
        assert!(extract_color(&[]).is_none());
    }

    #[test]
    fn output_is_valid_hex() {
        let bytes = png_bytes(32, 32, Rgba([10, 180, 90, 255]));
        let c = extract_color(&bytes).unwrap();
        assert!(c.starts_with('#'), "expected # prefix, got {c}");
        assert_eq!(c.len(), 7, "expected #RRGGBB, got {c}");
        assert!(
            c[1..].chars().all(|ch| ch.is_ascii_hexdigit()),
            "non-hex digits in {c}"
        );
    }
}

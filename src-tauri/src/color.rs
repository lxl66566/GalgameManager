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

use std::fs;

use futures::stream::{self, StreamExt};
use tauri::AppHandle;

use crate::{db::CONFIG, error::Result, http::IMAGE_CACHE_DIR};

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
    sha256: Option<&str>,
    need_color: bool,
) -> Result<(String, Option<String>)> {
    let resolved = crate::http::prepare_image(path_or_url, sha256).await?;
    let color = if need_color {
        compute_color(&resolved).await
    } else {
        None
    };
    Ok((resolved, color))
}

/// Re-extract the cover accent color for every game that has a cover image,
/// writing the results back into `Game.cover_color` and emitting
/// `config://updated`.
///
/// Called from the frontend when the user flips
/// `appearance.extract_cover_color` back on — every `cover_color` was purged
/// when the toggle was turned off, so this regenerates them in a single pass
/// instead of waiting for each game card to scroll into view and load its
/// image. Games without a usable cover (or whose extraction fails) are
/// silently skipped; their `cover_color` stays `None` and the statistics
/// page falls back to the golden-angle palette for them.
///
/// Concurrency is unbounded — the underlying `prepare_image` is mostly
/// `spawn_blocking` work (file I/O + image decode) which naturally fans out
/// across the tokio blocking pool, so one future per game saturates all
/// cores instead of artificial throttling.
pub async fn refresh_all_cover_colors(app: &AppHandle) -> Result<()> {
    // Snapshot under a short lock so the (slow) downloads / decodes below
    // don't block other CONFIG users.
    let tasks: Vec<(u32, String, Option<String>)> = {
        let lock = CONFIG.lock();
        lock.games
            .iter()
            .filter_map(|g| {
                let raw = g.image_url.as_deref()?;
                let resolved = lock.resolve_var(raw).ok()?;
                Some((g.id, resolved, g.image_sha256.clone()))
            })
            .collect()
    };

    let results: Vec<(u32, Option<String>)> = stream::iter(tasks)
        .map(|(id, url, hash)| async move {
            let color = prepare_image(&url, hash.as_deref(), true)
                .await
                .map(|(_, c)| c)
                .unwrap_or(None);
            (id, color)
        })
        .buffer_unordered(usize::MAX)
        .collect()
        .await;

    let mut updated = 0usize;
    let mut lock = CONFIG.lock();
    for (id, color) in results {
        if let Some(c) = color
            && let Ok(g) = lock.get_game_by_id_mut(id)
        {
            g.cover_color = Some(c);
            updated += 1;
        }
    }
    log::info!("[color] refreshed cover colors for {updated} games");
    lock.save_and_emit_no_update(app)?;
    Ok(())
}

/// Drop every game's cached `cover_color`. Used when the user turns the
/// `appearance.extract_cover_color` toggle off so the statistics page falls
/// back to the golden-angle palette and `prepare_image` stops doing color
/// work on subsequent loads.
pub fn clear_all_cover_colors(app: &AppHandle) -> Result<()> {
    let mut cleared = 0usize;
    let mut lock = CONFIG.lock();
    for g in &mut lock.games {
        if g.cover_color.take().is_some() {
            cleared += 1;
        }
    }
    log::info!("[color] cleared cover colors for {cleared} games");
    lock.save_and_emit_no_update(app)?;
    Ok(())
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

    // 1. 修复采样逻辑：使用 2D 步长，避免 1D 步长导致的垂直/水平条纹偏差
    let target_pixels: f64 = 4096.0;
    let step_x = ((w as f64) / target_pixels.sqrt()).ceil() as usize;
    let step_y = ((h as f64) / target_pixels.sqrt()).ceil() as usize;
    let step_x = step_x.max(1);
    let step_y = step_y.max(1);

    // 36 个色相桶，每 10 度一个
    const BUCKETS: usize = 36;
    let mut hue_buckets = vec![0.0f64; BUCKETS];

    // 记录每个像素的数据以便后续局部平均
    struct PixelData {
        h: f64,
        s: f64,
        l: f64,
        weight: f64,
    }
    let mut sampled_pixels = Vec::with_capacity(4096);

    let mut total_weight = 0.0;
    let mut valid_pixels = 0;

    for y in (0..h).step_by(step_y) {
        for x in (0..w).step_by(step_x) {
            let pixel = img.get_pixel(x as u32, y as u32);
            if pixel[3] < 128 {
                continue;
            }

            let r = pixel[0] as f64 / 255.0;
            let g = pixel[1] as f64 / 255.0;
            let b = pixel[2] as f64 / 255.0;
            let (hue, s, l) = rgb_to_hsl(r, g, b);

            // 权重逻辑保留：过滤掉黑白灰
            let l_weight = 1.0 - (2.0 * l - 1.0).abs();
            let weight = s * l_weight;

            if weight > 0.05 {
                // 忽略极度灰暗的像素
                let bucket_idx = ((hue / 10.0).floor() as usize) % BUCKETS;
                hue_buckets[bucket_idx] += weight;

                sampled_pixels.push(PixelData {
                    h: hue,
                    s,
                    l,
                    weight,
                });
                total_weight += weight;
                valid_pixels += 1;
            }
        }
    }

    if valid_pixels == 0 || total_weight < (valid_pixels as f64) * 0.02 {
        return None;
    }

    // 2. 找到权重最高的色相桶（主色调）
    let mut max_weight = -1.0;
    let mut best_bucket = 0;
    for i in 0..BUCKETS {
        // 考虑相邻桶的平滑（处理处于边界的颜色）
        let prev = (i + BUCKETS - 1) % BUCKETS;
        let next = (i + 1) % BUCKETS;
        let smoothed_weight = hue_buckets[prev] * 0.5 + hue_buckets[i] + hue_buckets[next] * 0.5;

        if smoothed_weight > max_weight {
            max_weight = smoothed_weight;
            best_bucket = i;
        }
    }

    // 3. 局部平均：只平均属于主色调范围内的像素
    let target_hue_center = best_bucket as f64 * 10.0 + 5.0;
    let mut sum_sin = 0.0;
    let mut sum_cos = 0.0;
    let mut sum_s = 0.0;
    let mut sum_l = 0.0;
    let mut cluster_weight = 0.0;

    for p in sampled_pixels {
        // 计算色相差（考虑 360 度循环）
        let mut diff = (p.h - target_hue_center).abs();
        if diff > 180.0 {
            diff = 360.0 - diff;
        }

        // 只统计距离主色调 30 度以内的像素
        if diff <= 30.0 {
            let rad = p.h * std::f64::consts::PI / 180.0;
            sum_cos += p.weight * rad.cos();
            sum_sin += p.weight * rad.sin();
            sum_s += p.weight * p.s;
            sum_l += p.weight * p.l;
            cluster_weight += p.weight;
        }
    }

    if cluster_weight == 0.0 {
        return None;
    }

    let mut final_hue = sum_sin.atan2(sum_cos).to_degrees();
    if final_hue < 0.0 {
        final_hue += 360.0;
    }

    let final_sat = sum_s / cluster_weight;
    let final_light = sum_l / cluster_weight;

    // 4. 优化 Clamp：放宽限制，保留原本色彩的特性，只做最基本的防瞎眼处理
    // 如果必须保证 UI 可读性，建议在前端用 CSS 处理，而不是在后端写死
    let sat = final_sat.clamp(0.15, 0.85);
    let light = final_light.clamp(0.20, 0.80);

    let (r, g, b) = hsl_to_rgb(final_hue, sat, light);
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

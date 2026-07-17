// src/pages/Statistics/gameColors.ts
// Series color assignment for the statistics charts:
// - games with a cover image → dominant color extracted from the image
//   (@material/material-color-utilities), cached per image hash;
// - games without one → deterministic HSL golden-angle hue rotation, so
//   consecutive game ids land on well-separated hues.
import { galimgUrl } from '@components/ui/CachedImage'
import {
  Hct,
  hexFromArgb,
  sourceColorFromImage
} from '@material/material-color-utilities'

const GOLDEN_ANGLE = 137.508

/** Fixed saturation / lightness, hue rotated by the golden angle. */
export function goldenColor(seed: number): string {
  const hue = (seed * GOLDEN_ANGLE) % 360
  return `hsl(${hue.toFixed(1)}, 65%, 55%)`
}

// In-flight / finished extractions keyed by image hash — repeat visits and
// re-renders are free, failures are cached too (as null).
const cache = new Map<string, Promise<string | null>>()

/** Dominant color of a cached cover image; null on any failure. */
export function imageColor(hash: string): Promise<string | null> {
  let p = cache.get(hash)
  if (!p) {
    p = extract(hash).catch(() => null)
    cache.set(hash, p)
  }
  return p
}

async function extract(hash: string): Promise<string | null> {
  // Fetch into a same-origin blob first: drawing a cross-protocol image
  // straight into a canvas would taint it and getImageData would throw.
  const resp = await fetch(galimgUrl(hash))
  if (!resp.ok) return null
  const url = URL.createObjectURL(await resp.blob())
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const argb = await sourceColorFromImage(img)
    // Normalize via Hct: raw dominant colors are often too murky (or too
    // close to gray) to read as a chart series color — guarantee a minimum
    // chroma and pin a mid tone that works on light and dark backgrounds.
    const hct = Hct.fromInt(argb)
    return hexFromArgb(Hct.from(hct.hue, Math.max(hct.chroma, 40), 55).toInt())
  } finally {
    URL.revokeObjectURL(url)
  }
}

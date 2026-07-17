// src/pages/Statistics/gameColors.ts
// Series color assignment for the statistics charts.
//
// Games with a cover image get a deterministic accent color extracted from
// the artwork on the Rust side (see `ensure_game_colors`); the cached value
// lives on `Game.coverColor` so repeat visits are instant. Games without a
// usable cover fall back to a deterministic HSL golden-angle rotation so
// consecutive ids land on well-separated hues.

const GOLDEN_ANGLE = 137.508

/** Fixed saturation / lightness, hue rotated by the golden angle. */
export function goldenColor(seed: number): string {
  const hue = (seed * GOLDEN_ANGLE) % 360
  return `hsl(${hue.toFixed(1)}, 65%, 55%)`
}

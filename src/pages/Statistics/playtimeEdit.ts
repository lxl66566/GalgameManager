// Pure merge/adjustment logic for the daily-playtime edit modal
// (DailyPlaytimeEditModal.tsx). Free of Solid / i18n dependencies so it stays
// unit-testable, mirroring timeRange.ts.

export type DailyPlaytime = Record<string, number>

/**
 * Apply a seconds delta to a `[secs, nanos]` useTime, clamped at zero.
 *
 * Deliberately delta-based: many games' totals predate the daily-statistics
 * feature, so `useTime` ≠ `sum(dailyPlaytime)` for them — writing an
 * absolute sum would corrupt those totals. The nanos part is untouched
 * (daily entries are whole seconds).
 */
export function applyUseTimeDelta(
  useTime: [number, number],
  deltaSecs: number
): [number, number] {
  return [Math.max(0, useTime[0] + deltaSecs), useTime[1]]
}

/**
 * Three-way merge of the user's draft into the live store state, resolved
 * at save time.
 *
 * - `snapshot`: dailyPlaytime as it was when the modal opened.
 * - `draft`: the snapshot after the user's edits (added keys present,
 *   deleted keys absent, edited keys re-valued).
 * - `live`: dailyPlaytime in the store at the moment of saving — the game
 *   loop may have accumulated "today" while the modal was open.
 *
 * Per key:
 * - in both draft & live: user-touched (draft ≠ snapshot) → draft value;
 *   untouched → live value (keeps background accumulation).
 * - live only: kept unless the snapshot had it, i.e. the user deleted it.
 * - draft only: a date the user added.
 * - Zero-value entries are dropped (the charts only count `secs > 0`, and
 *   the backend's entry()-based accumulation never stores 0).
 */
export function mergeDailyPlaytime(
  snapshot: DailyPlaytime,
  draft: DailyPlaytime,
  live: DailyPlaytime
): DailyPlaytime {
  const merged: DailyPlaytime = {}
  const keys = new Set([...Object.keys(live), ...Object.keys(draft)])
  for (const key of keys) {
    let secs: number | undefined
    if (Object.hasOwn(draft, key) && Object.hasOwn(live, key)) {
      secs = draft[key] !== snapshot[key] ? draft[key] : live[key]
    } else if (Object.hasOwn(live, key)) {
      // Absent from the draft: user-deleted (was in the snapshot) → drop;
      // backend-added while the modal was open → keep.
      if (!Object.hasOwn(snapshot, key)) secs = live[key]
    } else {
      secs = draft[key]
    }
    if (secs !== undefined && secs > 0) merged[key] = secs
  }
  return merged
}

/**
 * Overwrite the hour/minute part of a daily entry while preserving the
 * seconds part — the same alignment the game-edit dialog applies to
 * `useTime` (see `updateDuration` in GameEditModal), so sub-minute
 * precision recorded by the game loop is never clobbered.
 */
export function setHourMinute(secs: number, h: number, m: number): number {
  // Clamp: `min="0"` only constrains the stepper, a typed "-" still parses
  // to a negative int, and a negative entry would fail serde's u32 on the
  // Rust side.
  return Math.max(0, h * 3600 + m * 60 + (secs % 60))
}

export function sumDaily(map: DailyPlaytime | undefined): number {
  let sum = 0
  for (const v of Object.values(map ?? {})) sum += v
  return sum
}

/** Split a daily entry's seconds into {h, m} for the two number inputs. */
export function toHourMinute(secs: number): { h: number; m: number } {
  return { h: Math.floor(secs / 3600), m: Math.floor((secs % 3600) / 60) }
}

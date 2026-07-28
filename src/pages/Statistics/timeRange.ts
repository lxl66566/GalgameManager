// src/pages/Statistics/timeRange.ts
// Pure time-range bucketing & aggregation logic for the statistics charts.
// Intentionally free of Solid / d3 / i18n dependencies so it stays unit-testable.
//
// The charts consume a plain `BucketDatum[]`, so any range source works:
// the built-in week / month / year presets below, or a future free-form
// date-range picker — just build the matching `Bucket[]` and call `aggregate`.

export interface Bucket {
  /** Exclusive bucket end. */
  end: Date
  /** 'YYYY-MM-DD' for day buckets, 'YYYY-MM' for month buckets. */
  key: string
  /** Inclusive bucket start (local midnight / first of month). */
  start: Date
  unit: BucketUnit
}
export type BucketUnit = 'day' | 'month'

export type Granularity = 'month' | 'week' | 'year'

export interface ResolvedRange {
  buckets: Bucket[]
  /** Exclusive range end. */
  end: Date
  start: Date
}

export interface TimeSelection {
  granularity: Granularity
  /** 0 = current period, -1 = previous, +1 = next, … */
  offset: number
}

const DAY_MS = 86_400_000

export const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate())

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * Format a Date as the local 'YYYY-MM-DD' key. Must match the backend's
 * `chrono::Local` bucketing (see `update_game_time` in exec/mod.rs) so chart
 * days line up with recorded seconds.
 */
export const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

export const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`

/** Parse a 'YYYY-MM-DD' key back into a local Date; null when malformed. */
export function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

export const addDays = (d: Date, days: number): Date => {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

export interface BucketDatum extends Bucket {
  /** game id -> seconds played within this bucket (only non-zero entries). */
  perGame: Map<number, number>
  total: number
}

/** Minimal shape needed from a game — satisfied by the `Game` binding. */
export interface DailyPlaytimeLike {
  dailyPlaytime?: Record<string, number> | undefined
  id: number
}

export interface DurationUnits {
  hour: string
  minute: string
  second: string
}

export function aggregate(
  games: readonly DailyPlaytimeLike[],
  buckets: readonly Bucket[]
): BucketDatum[] {
  if (buckets.every(b => b.unit === 'day')) {
    return buckets.map(b => {
      const perGame = new Map<number, number>()
      let total = 0
      for (const g of games) {
        const secs = g.dailyPlaytime?.[b.key] ?? 0
        if (secs > 0) {
          perGame.set(g.id, secs)
          total += secs
        }
      }
      return { ...b, perGame, total }
    })
  }

  // Month buckets: pre-fold each game's daily entries into 'YYYY-MM' keys so
  // each bucket lookup is O(1) per game.
  const monthMaps = games.map(g => {
    const months = new Map<string, number>()
    for (const [date, secs] of Object.entries(g.dailyPlaytime ?? {})) {
      const k = date.slice(0, 7)
      months.set(k, (months.get(k) ?? 0) + secs)
    }
    return { id: g.id, months }
  })
  return buckets.map(b => {
    const perGame = new Map<number, number>()
    let total = 0
    for (const g of monthMaps) {
      const secs = g.months.get(b.key) ?? 0
      if (secs > 0) {
        perGame.set(g.id, secs)
        total += secs
      }
    }
    return { ...b, perGame, total }
  })
}

export function buildDayBuckets(start: Date, count: number): Bucket[] {
  const first = startOfDay(start)
  return Array.from({ length: count }, (_, index) => {
    const s = addDays(first, index)
    return { end: addDays(s, 1), key: dateKey(s), start: s, unit: 'day' as const }
  })
}

export function buildMonthBuckets(year: number, count = 12): Bucket[] {
  return Array.from({ length: count }, (_, index) => {
    const s = new Date(year, index, 1)
    return {
      end: new Date(year, index + 1, 1),
      key: monthKey(s),
      start: s,
      unit: 'month' as const
    }
  })
}

/** Compact human duration: '45 s' / '20 min' / '3 h 20 min' (units are localized). */
export function formatDuration(totalSecs: number, u: DurationUnits): string {
  const secs = Math.round(totalSecs)
  if (secs < 60) return `${secs} ${u.second}`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} ${u.minute}`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} ${u.hour}` : `${h} ${u.hour} ${m} ${u.minute}`
}
/**
 * First day of the week for a locale, normalized to 0 = Sunday … 6 = Saturday.
 * Uses the platform's `Intl.Locale.weekInfo` (Chromium 99+); falls back to
 * Monday, the ISO-8601 default.
 */
export function localeFirstWeekday(locale: string): number {
  try {
    const info = (
      new Intl.Locale(locale) as Intl.Locale & {
        weekInfo?: { firstDay?: number }
      }
    ).weekInfo
    // Intl reports Sunday as 7; normalize to 0-based (0 = Sunday).
    return (info?.firstDay ?? 1) % 7
  } catch {
    return 1
  }
}

/**
 * Offset of the period containing `date` relative to the period containing
 * `now`, for the given granularity. Negative when `date` is in the past.
 * Used by the date-picker jump: pick any day → show its week / month / year.
 */
export function offsetForDate(
  granularity: Granularity,
  date: Date,
  weekFirstDay: number,
  now: Date = new Date()
): number {
  switch (granularity) {
    case 'month': {
      return (
        (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth())
      )
    }
    case 'week': {
      const a = startOfWeek(now, weekFirstDay)
      const b = startOfWeek(date, weekFirstDay)
      return Math.round((b.getTime() - a.getTime()) / (7 * DAY_MS))
    }
    case 'year': {
      return date.getFullYear() - now.getFullYear()
    }
  }
}

/** Total seconds per game across all buckets. */
export function perGameTotals(data: readonly BucketDatum[]): Map<number, number> {
  const totals = new Map<number, number>()
  for (const b of data) {
    for (const [id, secs] of b.perGame) {
      totals.set(id, (totals.get(id) ?? 0) + secs)
    }
  }
  return totals
}

/** Expand a week / month / year selection into concrete buckets. */
export function resolveSelection(
  sel: TimeSelection,
  weekFirstDay: number,
  now: Date = new Date()
): ResolvedRange {
  switch (sel.granularity) {
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth() + sel.offset, 1)
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
      const days = Math.round((end.getTime() - start.getTime()) / DAY_MS)
      return { buckets: buildDayBuckets(start, days), end, start }
    }
    case 'week': {
      const start = addDays(startOfWeek(now, weekFirstDay), sel.offset * 7)
      return { buckets: buildDayBuckets(start, 7), end: addDays(start, 7), start }
    }
    case 'year': {
      const year = now.getFullYear() + sel.offset
      return {
        buckets: buildMonthBuckets(year),
        end: new Date(year + 1, 0, 1),
        start: new Date(year, 0, 1)
      }
    }
  }
}

/** Local midnight of the first day of the week containing `d`. */
export function startOfWeek(d: Date, firstDay: number): Date {
  const day = startOfDay(d)
  const diff = (day.getDay() - firstDay + 7) % 7
  return addDays(day, -diff)
}

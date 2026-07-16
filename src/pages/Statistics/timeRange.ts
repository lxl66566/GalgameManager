// src/pages/Statistics/timeRange.ts
// Pure time-range bucketing & aggregation logic for the statistics charts.
// Intentionally free of Solid / d3 / i18n dependencies so it stays unit-testable.
//
// The charts consume a plain `BucketDatum[]`, so any range source works:
// the built-in week / month / year presets below, or a future free-form
// date-range picker — just build the matching `Bucket[]` and call `aggregate`.

export type Granularity = 'week' | 'month' | 'year'
export type BucketUnit = 'day' | 'month'

export interface Bucket {
  /** 'YYYY-MM-DD' for day buckets, 'YYYY-MM' for month buckets. */
  key: string
  /** Inclusive bucket start (local midnight / first of month). */
  start: Date
  /** Exclusive bucket end. */
  end: Date
  unit: BucketUnit
}

export interface TimeSelection {
  granularity: Granularity
  /** 0 = current period, -1 = previous, +1 = next, … */
  offset: number
}

export interface ResolvedRange {
  buckets: Bucket[]
  start: Date
  /** Exclusive range end. */
  end: Date
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

export const addDays = (d: Date, days: number): Date => {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
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

/** Local midnight of the first day of the week containing `d`. */
export function startOfWeek(d: Date, firstDay: number): Date {
  const day = startOfDay(d)
  const diff = (day.getDay() - firstDay + 7) % 7
  return addDays(day, -diff)
}

export function buildDayBuckets(start: Date, count: number): Bucket[] {
  const first = startOfDay(start)
  return Array.from({ length: count }, (_, i) => {
    const s = addDays(first, i)
    return { key: dateKey(s), start: s, end: addDays(s, 1), unit: 'day' as const }
  })
}

export function buildMonthBuckets(year: number, count = 12): Bucket[] {
  return Array.from({ length: count }, (_, i) => {
    const s = new Date(year, i, 1)
    return {
      key: monthKey(s),
      start: s,
      end: new Date(year, i + 1, 1),
      unit: 'month' as const
    }
  })
}

/** Expand a week / month / year selection into concrete buckets. */
export function resolveSelection(
  sel: TimeSelection,
  weekFirstDay: number,
  now: Date = new Date()
): ResolvedRange {
  switch (sel.granularity) {
    case 'week': {
      const start = addDays(startOfWeek(now, weekFirstDay), sel.offset * 7)
      return { buckets: buildDayBuckets(start, 7), start, end: addDays(start, 7) }
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth() + sel.offset, 1)
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
      const days = Math.round((end.getTime() - start.getTime()) / DAY_MS)
      return { buckets: buildDayBuckets(start, days), start, end }
    }
    case 'year': {
      const year = now.getFullYear() + sel.offset
      return {
        buckets: buildMonthBuckets(year),
        start: new Date(year, 0, 1),
        end: new Date(year + 1, 0, 1)
      }
    }
  }
}

/** Minimal shape needed from a game — satisfied by the `Game` binding. */
export interface DailyPlaytimeLike {
  id: number
  dailyPlaytime?: Record<string, number> | undefined
}

export interface BucketDatum extends Bucket {
  /** game id -> seconds played within this bucket (only non-zero entries). */
  perGame: Map<number, number>
  total: number
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

export interface DurationUnits {
  second: string
  minute: string
  hour: string
}

/** Compact human duration: '45s' / '20m' / '3h 20m' (units are localized). */
export function formatDuration(totalSecs: number, u: DurationUnits): string {
  const secs = Math.round(totalSecs)
  if (secs < 60) return `${secs}${u.second}`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}${u.minute}`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}${u.hour}` : `${h}${u.hour} ${m}${u.minute}`
}

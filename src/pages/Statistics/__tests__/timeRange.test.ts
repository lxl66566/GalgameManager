// src/pages/Statistics/__tests__/timeRange.test.ts
import { describe, expect, it } from 'vitest'
import {
  aggregate,
  buildMonthBuckets,
  dateKey,
  formatDuration,
  perGameTotals,
  resolveSelection,
  startOfWeek,
  type DailyPlaytimeLike
} from '../timeRange'

// 2026-07-17 is a Friday.
const NOW = new Date(2026, 6, 17, 15, 30)

describe('startOfWeek', () => {
  it('starts on Monday when firstDay = 1', () => {
    const ws = startOfWeek(NOW, 1)
    expect(dateKey(ws)).toBe('2026-07-13')
  })

  it('starts on Sunday when firstDay = 0', () => {
    const ws = startOfWeek(NOW, 0)
    expect(dateKey(ws)).toBe('2026-07-12')
  })
})

describe('resolveSelection', () => {
  it('week: 7 day buckets starting on the week start', () => {
    const r = resolveSelection({ granularity: 'week', offset: 0 }, 1, NOW)
    expect(r.buckets).toHaveLength(7)
    expect(r.buckets[0].key).toBe('2026-07-13')
    expect(r.buckets[6].key).toBe('2026-07-19')
    expect(r.buckets.every(b => b.unit === 'day')).toBe(true)
  })

  it('week offset: shifts by whole weeks', () => {
    const prev = resolveSelection({ granularity: 'week', offset: -1 }, 1, NOW)
    expect(prev.buckets[0].key).toBe('2026-07-06')
    const next = resolveSelection({ granularity: 'week', offset: 2 }, 1, NOW)
    expect(next.buckets[0].key).toBe('2026-07-27')
  })

  it('month: one bucket per day of the month', () => {
    const jul = resolveSelection({ granularity: 'month', offset: 0 }, 1, NOW)
    expect(jul.buckets).toHaveLength(31)
    expect(jul.buckets[0].key).toBe('2026-07-01')
    expect(jul.buckets[30].key).toBe('2026-07-31')

    const feb = resolveSelection({ granularity: 'month', offset: -5 }, 1, NOW)
    expect(feb.buckets).toHaveLength(28) // 2026-02, not a leap year
    expect(feb.buckets[0].key).toBe('2026-02-01')
  })

  it('month offset: crosses year boundary', () => {
    const r = resolveSelection({ granularity: 'month', offset: 6 }, 1, NOW)
    expect(r.buckets[0].key).toBe('2027-01-01')
    expect(r.buckets).toHaveLength(31)
  })

  it('year: 12 month buckets', () => {
    const r = resolveSelection({ granularity: 'year', offset: 0 }, 1, NOW)
    expect(r.buckets).toHaveLength(12)
    expect(r.buckets[0].key).toBe('2026-01')
    expect(r.buckets[11].key).toBe('2026-12')
    expect(r.buckets.every(b => b.unit === 'month')).toBe(true)
  })

  it('year offset: shifts by whole years', () => {
    const r = resolveSelection({ granularity: 'year', offset: -1 }, 1, NOW)
    expect(r.buckets[0].key).toBe('2025-01')
  })
})

describe('aggregate', () => {
  const games: DailyPlaytimeLike[] = [
    { id: 1, dailyPlaytime: { '2026-07-13': 600, '2026-07-14': 900, '2026-06-30': 120 } },
    { id: 2, dailyPlaytime: { '2026-07-13': 300 } },
    { id: 3, dailyPlaytime: {} },
    { id: 4 } // no dailyPlaytime at all
  ]

  it('day buckets: direct date lookup, zeros skipped', () => {
    const r = resolveSelection({ granularity: 'week', offset: 0 }, 1, NOW)
    const data = aggregate(games, r.buckets)
    expect(data[0].key).toBe('2026-07-13')
    expect(data[0].perGame.get(1)).toBe(600)
    expect(data[0].perGame.get(2)).toBe(300)
    expect(data[0].perGame.has(3)).toBe(false)
    expect(data[0].total).toBe(900)
    expect(data[1].total).toBe(900)
    expect(data[2].total).toBe(0)
    // 2026-06-30 belongs to the previous week, never counted
    expect(data.every(b => (b.perGame.get(1) ?? 0) !== 120)).toBe(true)
  })

  it('month buckets: folds daily entries into YYYY-MM', () => {
    const data = aggregate(games, buildMonthBuckets(2026))
    const jul = data[6]
    expect(jul.key).toBe('2026-07')
    expect(jul.perGame.get(1)).toBe(1500)
    expect(jul.perGame.get(2)).toBe(300)
    expect(jul.total).toBe(1800)
    expect(data[5].perGame.get(1)).toBe(120) // June
  })
})

describe('perGameTotals', () => {
  it('sums across buckets', () => {
    const r = resolveSelection({ granularity: 'week', offset: 0 }, 1, NOW)
    const data = aggregate(
      [
        { id: 1, dailyPlaytime: { '2026-07-13': 600, '2026-07-14': 900 } },
        { id: 2, dailyPlaytime: { '2026-07-13': 300 } }
      ],
      r.buckets
    )
    const totals = perGameTotals(data)
    expect(totals.get(1)).toBe(1500)
    expect(totals.get(2)).toBe(300)
  })
})

describe('formatDuration', () => {
  const u = { second: 's', minute: 'm', hour: 'h' }

  it('formats seconds / minutes / hours', () => {
    expect(formatDuration(45, u)).toBe('45s')
    expect(formatDuration(59, u)).toBe('59s')
    expect(formatDuration(60, u)).toBe('1m')
    expect(formatDuration(1200, u)).toBe('20m')
    expect(formatDuration(3600, u)).toBe('1h')
    expect(formatDuration(3600 * 3 + 20 * 60, u)).toBe('3h 20m')
  })
})

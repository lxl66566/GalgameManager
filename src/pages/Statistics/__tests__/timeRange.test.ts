import { describe, expect, it } from 'vitest'

import {
  aggregate,
  buildDayBuckets,
  buildMonthBuckets,
  dateKey,
  formatDuration,
  logicalDateKey,
  offsetForDate,
  parseDateKey,
  perGameTotals,
  resolveSelection,
  startOfWeek,
  toLogical,
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
    expect(r.buckets[0]!.key).toBe('2026-07-13')
    expect(r.buckets[6]!.key).toBe('2026-07-19')
    expect(r.buckets.every(b => b.unit === 'day')).toBe(true)
  })

  it('week offset: shifts by whole weeks', () => {
    const previous = resolveSelection({ granularity: 'week', offset: -1 }, 1, NOW)
    expect(previous.buckets[0]!.key).toBe('2026-07-06')
    const next = resolveSelection({ granularity: 'week', offset: 2 }, 1, NOW)
    expect(next.buckets[0]!.key).toBe('2026-07-27')
  })

  it('month: one bucket per day of the month', () => {
    const jul = resolveSelection({ granularity: 'month', offset: 0 }, 1, NOW)
    expect(jul.buckets).toHaveLength(31)
    expect(jul.buckets[0]!.key).toBe('2026-07-01')
    expect(jul.buckets[30]!.key).toBe('2026-07-31')

    const feb = resolveSelection({ granularity: 'month', offset: -5 }, 1, NOW)
    expect(feb.buckets).toHaveLength(28) // 2026-02, not a leap year
    expect(feb.buckets[0]!.key).toBe('2026-02-01')
  })

  it('month offset: crosses year boundary', () => {
    const r = resolveSelection({ granularity: 'month', offset: 6 }, 1, NOW)
    expect(r.buckets[0]!.key).toBe('2027-01-01')
    expect(r.buckets).toHaveLength(31)
  })

  it('year: 12 month buckets', () => {
    const r = resolveSelection({ granularity: 'year', offset: 0 }, 1, NOW)
    expect(r.buckets).toHaveLength(12)
    expect(r.buckets[0]!.key).toBe('2026-01')
    expect(r.buckets[11]!.key).toBe('2026-12')
    expect(r.buckets.every(b => b.unit === 'month')).toBe(true)
  })

  it('year offset: shifts by whole years', () => {
    const r = resolveSelection({ granularity: 'year', offset: -1 }, 1, NOW)
    expect(r.buckets[0]!.key).toBe('2025-01')
  })
})

describe('dayStart (logical day)', () => {
  // dayStart 04:00: post-midnight instants belong to the previous day.
  const DS = 4 * 3600
  const NIGHT = new Date(2026, 6, 17, 2, 30) // Friday 02:30 → logical Thursday
  const MONDAY_NIGHT = new Date(2026, 6, 13, 2, 30) // Monday 02:30 → logical Sunday

  it('toLogical / logicalDateKey shift post-midnight instants to the previous day', () => {
    expect(logicalDateKey(NIGHT, DS)).toBe('2026-07-16')
    expect(logicalDateKey(new Date(2026, 6, 17, 4, 0), DS)).toBe('2026-07-17')
    expect(logicalDateKey(NIGHT, 0)).toBe('2026-07-17')
    expect(dateKey(toLogical(NIGHT, DS))).toBe('2026-07-16')
  })

  it('buildDayBuckets: bucket spans are shifted and keys stay logical', () => {
    const buckets = buildDayBuckets(NIGHT, 2, DS)
    expect(buckets[0]!.key).toBe('2026-07-16')
    expect(buckets[0]!.start).toEqual(new Date(2026, 6, 16, 4, 0))
    expect(buckets[0]!.end).toEqual(new Date(2026, 6, 17, 4, 0))
    expect(buckets[1]!.key).toBe('2026-07-17')
  })

  it('week: night owls see the previous logical week', () => {
    // Monday 02:30 with dayStart 04:00 is still logical Sunday → last week.
    const r = resolveSelection({ granularity: 'week', offset: 0 }, 1, MONDAY_NIGHT, DS)
    expect(r.buckets.map(b => b.key)).toEqual([
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12'
    ])
    expect(r.start).toEqual(new Date(2026, 6, 6, 4, 0))
    expect(r.end).toEqual(new Date(2026, 6, 13, 4, 0))
  })

  it('month: 1st 02:30 still belongs to the previous logical month', () => {
    const r = resolveSelection(
      { granularity: 'month', offset: 0 },
      1,
      new Date(2026, 7, 1, 2, 30), // Aug 1st, 02:30
      DS
    )
    expect(r.buckets).toHaveLength(31)
    expect(r.buckets[0]!.key).toBe('2026-07-01')
    expect(r.buckets[30]!.key).toBe('2026-07-31')
  })

  it('offsetForDate: picked natural "today" during the night maps to the logical week', () => {
    // Monday 02:30: logical week is 07-06..07-12, so picking natural Monday
    // 07-13 (or any day of the new week) is one week ahead.
    expect(offsetForDate('week', new Date(2026, 6, 13), 1, MONDAY_NIGHT, DS)).toBe(1)
    expect(offsetForDate('week', new Date(2026, 6, 12), 1, MONDAY_NIGHT, DS)).toBe(0)
  })

  it('dayStart 0 preserves the legacy behavior', () => {
    for (const sel of [
      { granularity: 'week' as const, offset: 0 },
      { granularity: 'month' as const, offset: -1 },
      { granularity: 'year' as const, offset: 0 }
    ]) {
      expect(resolveSelection(sel, 1, NOW, 0)).toEqual(resolveSelection(sel, 1, NOW))
    }
  })
})

describe('aggregate', () => {
  const games: DailyPlaytimeLike[] = [
    { dailyPlaytime: { '2026-06-30': 120, '2026-07-13': 600, '2026-07-14': 900 }, id: 1 },
    { dailyPlaytime: { '2026-07-13': 300 }, id: 2 },
    { dailyPlaytime: {}, id: 3 },
    { id: 4 } // no dailyPlaytime at all
  ]

  it('day buckets: direct date lookup, zeros skipped', () => {
    const r = resolveSelection({ granularity: 'week', offset: 0 }, 1, NOW)
    const data = aggregate(games, r.buckets)
    expect(data[0]!.key).toBe('2026-07-13')
    expect(data[0]!.perGame.get(1)).toBe(600)
    expect(data[0]!.perGame.get(2)).toBe(300)
    expect(data[0]!.perGame.has(3)).toBe(false)
    expect(data[0]!.total).toBe(900)
    expect(data[1]!.total).toBe(900)
    expect(data[2]!.total).toBe(0)
    // 2026-06-30 belongs to the previous week, never counted
    expect(data.every(b => (b.perGame.get(1) ?? 0) !== 120)).toBe(true)
  })

  it('month buckets: folds daily entries into YYYY-MM', () => {
    const data = aggregate(games, buildMonthBuckets(2026))
    const jul = data[6]!
    expect(jul.key).toBe('2026-07')
    expect(jul.perGame.get(1)).toBe(1500)
    expect(jul.perGame.get(2)).toBe(300)
    expect(jul.total).toBe(1800)
    expect(data[5]!.perGame.get(1)).toBe(120) // June
  })
})

describe('perGameTotals', () => {
  it('sums across buckets', () => {
    const r = resolveSelection({ granularity: 'week', offset: 0 }, 1, NOW)
    const data = aggregate(
      [
        { dailyPlaytime: { '2026-07-13': 600, '2026-07-14': 900 }, id: 1 },
        { dailyPlaytime: { '2026-07-13': 300 }, id: 2 }
      ],
      r.buckets
    )
    const totals = perGameTotals(data)
    expect(totals.get(1)).toBe(1500)
    expect(totals.get(2)).toBe(300)
  })
})

describe('parseDateKey / offsetForDate', () => {
  it('parseDateKey round-trips dateKey and rejects garbage', () => {
    expect(parseDateKey('2026-07-13')).toEqual(new Date(2026, 6, 13))
    expect(parseDateKey('2026/07/13')).toBeNull()
    expect(parseDateKey('13-07-2026')).toBeNull()
    expect(parseDateKey('')).toBeNull()
  })

  it('week: offset counts whole weeks between the two week starts', () => {
    expect(offsetForDate('week', new Date(2026, 6, 17), 1, NOW)).toBe(0)
    expect(offsetForDate('week', new Date(2026, 6, 12), 1, NOW)).toBe(-1) // Sunday before
    expect(offsetForDate('week', new Date(2026, 6, 13), 0, NOW)).toBe(0) // Sunday-first: same week
    expect(offsetForDate('week', new Date(2026, 0, 1), 1, NOW)).toBe(-28)
  })

  it('month / year: calendar difference', () => {
    expect(offsetForDate('month', new Date(2026, 6, 1), 1, NOW)).toBe(0)
    expect(offsetForDate('month', new Date(2026, 0, 31), 1, NOW)).toBe(-6)
    expect(offsetForDate('month', new Date(2027, 0, 1), 1, NOW)).toBe(6)
    expect(offsetForDate('year', new Date(2024, 11, 31), 1, NOW)).toBe(-2)
  })
})

describe('formatDuration', () => {
  const u = { hour: 'h', minute: 'm', second: 's' }

  it('formats seconds / minutes / hours with a space before the unit', () => {
    expect(formatDuration(45, u)).toBe('45 s')
    expect(formatDuration(59, u)).toBe('59 s')
    expect(formatDuration(60, u)).toBe('1 m')
    expect(formatDuration(1200, u)).toBe('20 m')
    expect(formatDuration(3600, u)).toBe('1 h')
    expect(formatDuration(3600 * 3 + 20 * 60, u)).toBe('3 h 20 m')
  })
})

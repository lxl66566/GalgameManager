// src/pages/Statistics/__tests__/playtimeEdit.test.ts
import { describe, expect, it } from 'vitest'

import {
  applyUseTimeDelta,
  mergeDailyPlaytime,
  setHourMinute,
  sumDaily,
  toHourMinute
} from '../playtimeEdit'

describe('setHourMinute', () => {
  it('preserves the seconds part when h/m change', () => {
    // 3675s = 1h 1m 15s → 2h 3m keeps the 15s
    expect(setHourMinute(3675, 2, 3)).toBe(2 * 3600 + 3 * 60 + 15)
  })

  it('clamps negative input to zero', () => {
    expect(setHourMinute(0, -1, 0)).toBe(0)
    // -5m + 40s is a negative total → clamped, not partially preserved.
    expect(setHourMinute(100, 0, -5)).toBe(0)
  })
})

describe('toHourMinute', () => {
  it('splits whole minutes, floors the rest', () => {
    expect(toHourMinute(3675)).toEqual({ h: 1, m: 1 }) // 15s remainder dropped
    expect(toHourMinute(0)).toEqual({ h: 0, m: 0 })
    expect(toHourMinute(7200)).toEqual({ h: 2, m: 0 })
  })
})

describe('sumDaily', () => {
  it('sums values and tolerates undefined', () => {
    expect(sumDaily({ a: 10, b: 32 })).toBe(42)
    expect(sumDaily(undefined)).toBe(0)
    expect(sumDaily({})).toBe(0)
  })
})

describe('mergeDailyPlaytime', () => {
  it('keeps the live value for keys the user did not touch', () => {
    // Background accumulation on 07-01 while the modal was open.
    const snapshot = { '2026-07-01': 60 }
    const draft = { '2026-07-01': 60 }
    const live = { '2026-07-01': 120 }
    expect(mergeDailyPlaytime(snapshot, draft, live)).toEqual({ '2026-07-01': 120 })
  })

  it('user edits win over background writes on the same key', () => {
    const snapshot = { '2026-07-01': 60 }
    const draft = { '2026-07-01': 3600 }
    const live = { '2026-07-01': 120 }
    expect(mergeDailyPlaytime(snapshot, draft, live)).toEqual({ '2026-07-01': 3600 })
  })

  it('an edit reverted to the snapshot value falls back to live', () => {
    // draft == snapshot means no net edit, so the live value survives.
    const snapshot = { '2026-07-01': 60 }
    const draft = { '2026-07-01': 60 }
    const live = { '2026-07-01': 120 }
    expect(mergeDailyPlaytime(snapshot, draft, live)).toEqual({ '2026-07-01': 120 })
  })

  it('drops keys the user deleted', () => {
    const snapshot = { '2026-07-01': 60, '2026-07-02': 30 }
    const draft = { '2026-07-01': 60 }
    const live = { '2026-07-01': 60, '2026-07-02': 30 }
    expect(mergeDailyPlaytime(snapshot, draft, live)).toEqual({ '2026-07-01': 60 })
  })

  it('keeps keys the backend added while the modal was open', () => {
    const snapshot = { '2026-07-01': 60 }
    const draft = { '2026-07-01': 60 }
    const live = { '2026-07-01': 60, '2026-07-02': 90 }
    expect(mergeDailyPlaytime(snapshot, draft, live)).toEqual({
      '2026-07-01': 60,
      '2026-07-02': 90
    })
  })

  it('keeps dates the user added', () => {
    const snapshot: Record<string, number> = {}
    const draft = { '2026-07-03': 1800 }
    const live: Record<string, number> = {}
    expect(mergeDailyPlaytime(snapshot, draft, live)).toEqual({ '2026-07-03': 1800 })
  })

  it('drops zero-value entries (user zeroed a day)', () => {
    const snapshot = { '2026-07-01': 60, '2026-07-02': 30 }
    const draft = { '2026-07-01': 0, '2026-07-02': 30 }
    const live = { '2026-07-01': 60, '2026-07-02': 30 }
    expect(mergeDailyPlaytime(snapshot, draft, live)).toEqual({ '2026-07-02': 30 })
  })
})

describe('applyUseTimeDelta', () => {
  it('applies positive and negative deltas, keeping nanos', () => {
    expect(applyUseTimeDelta([100, 5], 60)).toEqual([160, 5])
    expect(applyUseTimeDelta([100, 5], -60)).toEqual([40, 5])
  })

  it('clamps at zero instead of going negative', () => {
    // Legal legacy state: total below the daily sum (statistics came later).
    expect(applyUseTimeDelta([100, 7], -1000)).toEqual([0, 7])
  })
})

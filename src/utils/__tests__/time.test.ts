import {
  dateToInput,
  displayDuration,
  durationToForm,
  durationToSecs,
  formatAbsoluteIso,
  formatTimeAgo,
  formatTimeAgoLocale,
  inputToDate,
  type TFunc
} from '@utils/time'
import { describe, expect, it } from 'vitest'

// Build a minimal translator so we don't need the full i18n dictionary.
// The `time.*` keys are the only ones exercised by formatTimeAgo.
const enTimeDict: Record<string, string> = {
  'time.never': 'Never',
  'time.justNow': 'Just now',
  'time.minutesAgo': '{{n}}m ago',
  'time.hoursAgo': '{{n}}h ago',
  'time.daysAgo': '{{n}}d ago',
  'time.monthsAgo': '{{n}}mo ago',
  'time.yearsAgo': '{{n}}y ago'
}
const t: TFunc = ((key: string, params?: { n?: string }) => {
  const tmpl = enTimeDict[key] ?? key
  if (params?.n !== undefined) return tmpl.replace('{{n}}', params.n)
  return tmpl
}) as TFunc

describe('durationToForm', () => {
  it('splits seconds into h/m', () => {
    expect(durationToForm([3661, 0])).toEqual({ h: 1, m: 1 })
    expect(durationToForm([0, 0])).toEqual({ h: 0, m: 0 })
    expect(durationToForm([3599, 0])).toEqual({ h: 0, m: 59 })
    expect(durationToForm([7200, 0])).toEqual({ h: 2, m: 0 })
  })
})

describe('durationToSecs', () => {
  it('adds the nanos as a fraction', () => {
    expect(durationToSecs([10, 0])).toBe(10)
    expect(durationToSecs([10, 500_000_000])).toBeCloseTo(10.5)
    expect(durationToSecs([0, 1_000_000_000])).toBeCloseTo(1.0)
  })
})

describe('displayDuration', () => {
  it('formats as XhYm', () => {
    expect(displayDuration([3661, 0])).toBe('1h1m')
    expect(displayDuration([0, 0])).toBe('0h0m')
    expect(displayDuration([7200, 0])).toBe('2h0m')
  })
})

describe('dateToInput / inputToDate roundtrip', () => {
  it('dateToInput returns empty for null', () => {
    expect(dateToInput(null)).toBe('')
  })
  it('inputToDate returns null for empty', () => {
    expect(inputToDate('')).toBeNull()
  })
  it('roundtrips a local datetime value', () => {
    // inputToDate takes a "YYYY-MM-DDTHH:mm" local string; dateToInput
    // converts back. The roundtrip preserves the wall-clock (UTC offset
    // applied then removed).
    const iso = inputToDate('2024-05-01T12:00')!
    expect(iso).toBeTruthy()
    const back = dateToInput(iso)
    expect(back).toBe('2024-05-01T12:00')
  })
})

describe('formatTimeAgo', () => {
  it('returns Never for null', () => {
    expect(formatTimeAgo(null, t)).toBe('Never')
  })
  it('returns Just now for < 60s ago', () => {
    const recent = new Date(Date.now() - 5_000).toISOString()
    expect(formatTimeAgo(recent, t)).toBe('Just now')
  })
  it('formats minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatTimeAgo(d, t)).toBe('5m ago')
  })
  it('formats hours ago', () => {
    const d = new Date(Date.now() - 3 * 3_600_000).toISOString()
    expect(formatTimeAgo(d, t)).toBe('3h ago')
  })
  it('formats days ago', () => {
    const d = new Date(Date.now() - 7 * 86_400_000).toISOString()
    expect(formatTimeAgo(d, t)).toBe('7d ago')
  })
  it('formats months ago (>= 30 days)', () => {
    const d = new Date(Date.now() - 90 * 86_400_000).toISOString()
    expect(formatTimeAgo(d, t)).toBe('3mo ago')
  })
  it('formats years ago (>= 365 days)', () => {
    const d = new Date(Date.now() - 800 * 86_400_000).toISOString()
    expect(formatTimeAgo(d, t)).toMatch(/y ago/)
  })
})

describe('formatTimeAgoLocale', () => {
  it('falls back to en-US when given an unknown locale', () => {
    const d = new Date(Date.now() - 5_000).toISOString()
    // @ts-expect-error: intentionally invalid locale key
    expect(formatTimeAgoLocale(d, 'fr-FR')).toBe('Just now')
  })
  it('renders zh-CN strings', () => {
    const recent = new Date(Date.now() - 5_000).toISOString()
    expect(formatTimeAgoLocale(recent, 'zh-CN')).toBe('刚刚')
    const mins = new Date(Date.now() - 10 * 60_000).toISOString()
    expect(formatTimeAgoLocale(mins, 'zh-CN')).toBe('10 分钟前')
  })
  it('renders en-US strings', () => {
    const recent = new Date(Date.now() - 5_000).toISOString()
    expect(formatTimeAgoLocale(recent, 'en-US')).toBe('Just now')
  })
  it('returns Never for null', () => {
    expect(formatTimeAgoLocale(null, 'en-US')).toBe('Never')
    expect(formatTimeAgoLocale(null, 'zh-CN')).toBe('永不')
  })
})

describe('formatAbsoluteIso', () => {
  it('returns Never-equivalent for null', () => {
    // Implementation returns en-US 'never' string for null regardless of locale.
    expect(formatAbsoluteIso(null, 'YYYY-MM-DD')).toBe('Never')
  })
  it('returns the raw ISO string when pattern is empty', () => {
    const iso = '2024-05-01T12:34:56Z'
    expect(formatAbsoluteIso(iso, '')).toBe(iso)
    expect(formatAbsoluteIso(iso, '   ')).toBe(iso)
  })
  it('formats using the dayjs pattern', () => {
    const iso = '2024-05-01T12:34:56Z'
    // Dayjs honours the system timezone when formatting an ISO string;
    // we just assert the pattern was applied (digits + separators) rather
    // than hard-coding the hour to keep the test timezone-independent.
    const out = formatAbsoluteIso(iso, 'YYYY-MM-DD')
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

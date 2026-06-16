// Time / duration formatting helpers.
//
// The "relative" formatter can run in either the global UI language or
// an override chosen by the user (see `TimeLanguage` in
// `AppearanceConfig`). The "absolute" formatter delegates to dayjs
// so users can specify any pattern supported by dayjs.
import dayjs from 'dayjs'
import type { Translator } from '@solid-primitives/i18n'
import type { Locale } from '~/i18n'
import type { RawDictionary } from '~/i18n/en-US'

export type TFunc = Translator<
  import('@solid-primitives/i18n').Flatten<RawDictionary>,
  string
>

// ── duration helpers ────────────────────────────────────────────────────────

const dateToInput = (isoStr: string | null) => {
  if (!isoStr) return ''
  // 假设后端给的是 ISO 格式 (UTC)，我们需要转为本地时间给 input 显示
  // 这里的逻辑是将 UTC 时间转换为本地时间的 ISO 字符串片段
  const date = new Date(isoStr)
  const offset = date.getTimezoneOffset() * 60000
  const localDate = new Date(date.getTime() - offset)
  return localDate.toISOString().slice(0, 16) // YYYY-MM-DDTHH:mm
}

const inputToDate = (val: string) => {
  if (!val) return null
  // input 产生的是本地时间，转回 ISO (UTC) 存库
  return new Date(val).toISOString()
}

// 时长转换工具 [secs, nanos] <-> {h, m}
const durationToForm = (useTime: [number, number]) => {
  const totalSecs = useTime[0]
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  return { h, m }
}

const durationToSecs = (useTime: [number, number]) => {
  return useTime[0] + useTime[1] / 1e9
}

const displayDuration = (d: [number, number]) => {
  const form = durationToForm(d)
  return `${form.h}h${form.m}m`
}

// ── relative time ───────────────────────────────────────────────────────────

/**
 * Statically-defined relative-time strings, keyed by locale.
 *
 * We intentionally don't reuse the global i18n dictionary here so the
 * home-page timestamps can be rendered in a different language than
 * the rest of the UI (the `timeDisplay.language` setting).
 */
const RELATIVE_TIME_DICT: Record<
  Locale,
  {
    never: string
    justNow: string
    minutesAgo: (n: number) => string
    hoursAgo: (n: number) => string
    daysAgo: (n: number) => string
    monthsAgo: (n: number) => string
    yearsAgo: (n: number) => string
  }
> = {
  'en-US': {
    never: 'Never',
    justNow: 'Just now',
    minutesAgo: n => `${n}m ago`,
    hoursAgo: n => `${n}h ago`,
    daysAgo: n => `${n}d ago`,
    monthsAgo: n => `${n}mo ago`,
    yearsAgo: n => `${n}y ago`
  },
  'zh-CN': {
    never: '永不',
    justNow: '刚刚',
    minutesAgo: n => `${n} 分钟前`,
    hoursAgo: n => `${n} 小时前`,
    daysAgo: n => `${n} 天前`,
    monthsAgo: n => `${n} 个月前`,
    yearsAgo: n => `${n} 年前`
  }
}

/**
 * Format an ISO timestamp as a relative time string, using either the
 * global translator or the override locale selected in
 * `AppearanceConfig.timeDisplay`.
 *
 * Passing the global `t` keeps backward compatibility for callers that
 * haven't migrated yet — they get the same strings they used to.
 */
const formatTimeAgo = (dateStr: string | null, t: TFunc): string => {
  if (!dateStr) return t('time.never')

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)

  if (diffSecs < 60) return t('time.justNow')

  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return t('time.minutesAgo', { n: String(diffMins) })

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return t('time.hoursAgo', { n: String(diffHours) })

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return t('time.daysAgo', { n: String(diffDays) })

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return t('time.monthsAgo', { n: String(diffMonths) })

  const diffYears = Math.floor(diffDays / 365)
  return t('time.yearsAgo', { n: String(diffYears) })
}

/**
 * Variant of {@link formatTimeAgo} that takes an explicit locale
 * instead of a translator. Used by the home page when the user has
 * selected a per-timestamp language override.
 */
const formatTimeAgoLocale = (dateStr: string | null, locale: Locale): string => {
  const dict = RELATIVE_TIME_DICT[locale] ?? RELATIVE_TIME_DICT['en-US']
  if (!dateStr) return dict.never

  const date = new Date(dateStr)
  const now = new Date()
  const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSecs < 60) return dict.justNow
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return dict.minutesAgo(diffMins)
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return dict.hoursAgo(diffHours)
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return dict.daysAgo(diffDays)
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return dict.monthsAgo(diffMonths)
  return dict.yearsAgo(Math.floor(diffDays / 365))
}

// ── absolute time ───────────────────────────────────────────────────────────

/**
 * Format an ISO timestamp using a dayjs pattern. Falls back to the
 * raw ISO string when the pattern is empty/invalid.
 */
const formatAbsoluteIso = (dateStr: string | null, pattern: string): string => {
  if (!dateStr) return RELATIVE_TIME_DICT['en-US'].never
  const p = pattern?.trim()
  if (!p) return dateStr
  return dayjs(dateStr).format(p)
}

export {
  dateToInput,
  inputToDate,
  durationToForm,
  durationToSecs,
  displayDuration,
  formatTimeAgo,
  formatTimeAgoLocale,
  formatAbsoluteIso
}

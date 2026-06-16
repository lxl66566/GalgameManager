// 简单的日期转换工具
import type { Translator } from '@solid-primitives/i18n'
import type { RawDictionary } from '~/i18n/en-US'

export type TFunc = Translator<
  import('@solid-primitives/i18n').Flatten<RawDictionary>,
  string
>

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

const formatTimeAgo = (dateStr: string | null, t: TFunc) => {
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

export {
  dateToInput,
  inputToDate,
  durationToForm,
  durationToSecs,
  displayDuration,
  formatTimeAgo
}

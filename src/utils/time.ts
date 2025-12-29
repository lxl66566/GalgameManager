// 简单的日期转换工具
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

const displayDuration = (d: [number, number]) => {
  const form = durationToForm(d)
  return `${form.h}h${form.m}m`
}

const formatTimeAgo = (dateStr: string | null) => {
  if (!dateStr) return 'Never'

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)

  if (diffSecs < 60) return 'Just now'

  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo ago`

  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears}y ago`
}

export { dateToInput, inputToDate, durationToForm, displayDuration, formatTimeAgo }

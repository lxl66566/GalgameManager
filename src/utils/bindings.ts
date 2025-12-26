/**
 * 如果不足1小时，不显示小时；如果是0，显示 0min
 * @example "1h 5min", "45min", "0min"
 */
export const formatDuration = (d: [number, number]): string => {
  if (!d) return '0min'

  const totalSeconds = d[0]
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}min`
  }
  return `${minutes}min`
}

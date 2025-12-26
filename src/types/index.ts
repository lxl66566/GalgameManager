/**
 * ISO 8601 格式的时间字符串
 * 例如: "2023-12-25T17:45:00Z"
 */
export type DateTime = string

/**
 * Rust std::time::Duration 的默认序列化结构
 */
export interface Duration {
  secs: number
  nanos: number
}

export interface Device {
  name: string
  uid: string
  variables: Record<string, string>
}

export interface Game {
  name: string
  excutablePath?: string | null
  savePaths: string[]
  imageUrl?: string | null
  imageSha256?: string | null
  addedTime: DateTime
  lastPlayedTime?: DateTime | null
  useTime: Duration
}

export interface Config {
  dbVersion: number
  lastUpdated: DateTime
  games: Game[]
  devices: Device[]
}

/**
 * 如果不足1小时，不显示小时；如果是0，显示 0min
 * @example "1h 5min", "45min", "0min"
 */
export const formatDuration = (d: Duration): string => {
  if (!d) return '0min'

  const totalSeconds = d.secs
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}min`
  }
  return `${minutes}min`
}

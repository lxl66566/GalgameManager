import { type LogLevel } from '@bindings/LogLevel'
import { invoke } from '@tauri-apps/api/core'

export function log(level: LogLevel, message: string) {
  try {
    invoke('log', { level, message })
  } catch (_) {}
}

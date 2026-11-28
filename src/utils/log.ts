import { type LogLevel } from '@bindings/LogLevel'
import { invoke } from '@tauri-apps/api/core'

/**
 * Best-effort stringification of a caught value (typically an `unknown`
 * from a catch clause) for display in toasts/logs. Avoids the
 * "[object Object]" fallback and satisfies the type-aware lint rules
 * that forbid interpolating `unknown` directly.
 */
export function errToStr(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

/**
 * Format the arg list into a string, console.log-style: objects are
 * JSON-stringified and results concatenated.
 */
function formatArgs(args: unknown[]): string {
  return args
    .map(argument => {
      if (argument instanceof Error) {
        return argument.stack ?? argument.message
      }
      if (typeof argument === 'string') return argument
      if (
        typeof argument === 'number' ||
        typeof argument === 'boolean' ||
        typeof argument === 'bigint'
      ) {
        return argument.toString()
      }
      // object / null / symbol / function / undefined
      try {
        return JSON.stringify(argument)
      } catch {
        return '[unserializable]'
      }
    })
    .join('')
}

/**
 * Send one log line to the backend.
 */
function send(level: LogLevel, args: unknown[]) {
  const message = formatArgs(args)

  // Fire-and-forget IPC from a sync function: there's no caller to await,
  // so `.catch` is the appropriate way to surface backend failures.
  void invoke('log', { level, msg: message }).catch((error: unknown) => {
    console.error('Failed to log:', errToStr(error))
  })
}

// Level helpers as a plain object keep every existing `log.info(...)` /
// `log.warn(...)` call site working. Assigning the helpers onto the `log`
// function instead would be a top-level side effect.
// NOTE: the keys match the backend LogLevel variant values.
export const log: Record<LogLevel, (...args: unknown[]) => void> = {
  debug: (...args) => {
    send('debug', args)
  },
  error: (...args) => {
    send('error', args)
  },
  info: (...args) => {
    send('info', args)
  },
  trace: (...args) => {
    send('trace', args)
  },
  warn: (...args) => {
    send('warn', args)
  }
}

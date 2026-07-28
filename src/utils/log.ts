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
 * 基础 log 函数，支持 log('info', 'msg', obj, 123) 调用方式
 */
export function log(level: LogLevel, ...args: unknown[]) {
  // 将所有参数合并成一个字符串发送给 Rust
  const message = formatArgs(args)

  // Fire-and-forget IPC from a sync function: there's no caller to await,
  // so `.catch` is the appropriate way to surface backend failures.
  void invoke('log', { level, msg: message }).catch((error: unknown) => {
    console.error('Failed to log:', errToStr(error))
  })
}

/**
 * 内部辅助函数：将参数数组格式化为字符串
 * 类似于 console.log 的行为，将对象转为 JSON 字符串，以空格连接
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

// Namespace-free equivalents of the old `namespace log` API. Attaching the
// level helpers as plain function properties keeps every existing
// `log.info(...)` / `log.warn(...)` call site working without an ES
// namespace (which eslint flags).
// 注意：这里的字符串 ('trace', 'info' 等) 需要匹配你 LogLevel 类型定义的实际值。
log.trace = function (...args: unknown[]) {
  log('trace', ...args)
}
log.debug = function (...args: unknown[]) {
  log('debug', ...args)
}
log.info = function (...args: unknown[]) {
  log('info', ...args)
}
log.warn = function (...args: unknown[]) {
  log('warn', ...args)
}
log.error = function (...args: unknown[]) {
  log('error', ...args)
}

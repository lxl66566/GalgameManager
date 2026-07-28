import { type LogLevel } from '@bindings/LogLevel'
import { invoke } from '@tauri-apps/api/core'

/**
 * 基础 log 函数，支持 log('info', 'msg', obj, 123) 调用方式
 */
export function log(level: LogLevel, ...args: unknown[]) {
  // 将所有参数合并成一个字符串发送给 Rust
  const message = formatArgs(args)

  invoke('log', { level, msg: message }).catch(error => {
    console.error('Failed to log: ' + error)
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
        return argument.stack || argument.message
      }
      if (typeof argument === 'object') {
        try {
          return JSON.stringify(argument)
        } catch {
          return String(argument)
        }
      }
      return String(argument)
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

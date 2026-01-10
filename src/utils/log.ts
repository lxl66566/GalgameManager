import { type LogLevel } from '@bindings/LogLevel'
import { invoke } from '@tauri-apps/api/core'

/**
 * 内部辅助函数：将参数数组格式化为字符串
 * 类似于 console.log 的行为，将对象转为 JSON 字符串，以空格连接
 */
function formatArgs(args: any[]): string {
  return args
    .map(arg => {
      if (arg instanceof Error) {
        return arg.stack || arg.message
      }
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    })
    .join('')
}

/**
 * 基础 log 函数，支持 log('info', 'msg', obj, 123) 调用方式
 */
export function log(level: LogLevel, ...args: any[]) {
  // 将所有参数合并成一个字符串发送给 Rust
  const msg = formatArgs(args)

  invoke('log', { level, msg }).catch(e => {
    console.error('Failed to log: ' + e)
  })
}

/**
 * 使用 namespace 扩展 log 函数，支持 log.info('msg', obj) 调用方式
 */
export namespace log {
  // 注意：这里的字符串 ('trace', 'info' 等) 需要匹配你 LogLevel 类型定义的实际值。

  export function trace(...args: any[]) {
    log('trace', ...args)
  }

  export function debug(...args: any[]) {
    log('debug', ...args)
  }

  export function info(...args: any[]) {
    log('info', ...args)
  }

  export function warn(...args: any[]) {
    log('warn', ...args)
  }

  export function error(...args: any[]) {
    log('error', ...args)
  }
}

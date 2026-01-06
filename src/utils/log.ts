import { type LogLevel } from '@bindings/LogLevel'
import { invoke } from '@tauri-apps/api/core'

/**
 * 基础 log 函数，支持 log('info', 'msg') 调用方式
 */
export function log(level: LogLevel, msg: string) {
  invoke('log', { level, msg }).catch(e => {
    console.error('Failed to log: ' + e)
  })
}

/**
 * 使用 namespace 扩展 log 函数，支持 log.info('msg') 调用方式
 */
export namespace log {
  // 注意：这里的字符串 ('Trace', 'Info' 等) 需要匹配你 LogLevel 类型定义的实际值。
  // 如果你的 LogLevel 是全小写 (type LogLevel = 'info' | 'warn' ...)，请将下面参数改为小写。

  export function trace(msg: string) {
    log('trace', msg)
  }

  export function debug(msg: string) {
    log('debug', msg)
  }

  export function info(msg: string) {
    log('info', msg)
  }

  export function warn(msg: string) {
    log('warn', msg)
  }

  export function error(msg: string) {
    log('error', msg)
  }
}

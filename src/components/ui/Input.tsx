/**
 * 基础单行输入框组件，主要用于 GameEditModal 组件
 * 包含默认的边框、背景色、焦点高亮以及禁用状态样式
 */

import { cn } from '~/lib/utils'
import { splitProps, type JSX } from 'solid-js'

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [local, rest] = splitProps(props, ['class'])

  return (
    <input
      class={cn(
        'w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600',
        'rounded px-2 py-1 text-sm text-gray-900 dark:text-white',
        'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
        local.class
      )}
      {...rest}
    />
  )
}

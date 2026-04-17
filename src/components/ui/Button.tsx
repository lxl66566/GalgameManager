/**
 * 按钮组件，主要用于 GameEditModal 组件
 * 通过 variant 和 size 属性控制不同形态，支持传入 class 覆盖
 */

import { cn } from '~/lib/utils'
import { splitProps, type JSX } from 'solid-js'

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost-danger'
  size?: 'sm' | 'md' | 'icon'
}

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ['class', 'variant', 'size'])

  const baseStyles =
    'inline-flex items-center justify-center gap-1.5 rounded font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary:
      'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-500 shadow-sm',
    secondary:
      'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
    danger:
      'bg-red-500 hover:bg-red-600 text-white dark:bg-red-600 dark:hover:bg-red-700 shadow-sm',
    'ghost-danger':
      'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    icon: 'p-2'
  }

  return (
    <button
      class={cn(
        baseStyles,
        variants[local.variant || 'secondary'],
        sizes[local.size || 'md'],
        local.class
      )}
      {...rest}
    />
  )
}

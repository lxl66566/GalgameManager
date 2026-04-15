/**
 * Input — A styled text input with size variants.
 *
 * Unifies the input styles used across settings (md) and inline forms / modals (sm).
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'

export type ControlSize = 'sm' | 'md'

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  size?: ControlSize
}

export const Input: Component<InputProps> = props => {
  const [local, rest] = splitProps(props, ['class', 'size'])

  return (
    <input
      class={cn(
        'rounded border border-gray-300 dark:border-gray-600',
        'bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100',
        'shadow-sm',
        'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
        'placeholder-gray-400 dark:placeholder-gray-500 transition-all outline-none',
        local.size === 'sm' ? 'h-7 w-full px-2 py-0' : 'h-8 w-full px-2.5 py-0',
        local.class
      )}
      {...rest}
    />
  )
}

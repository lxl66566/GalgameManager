/**
 * Input.tsx — Primitive text input with size variants.
 *
 * Sizes:
 *   - `'sm'` — compact density (h-7, text-xs)
 *   - `'md'` — standard density (h-8, text-xs, w-64 on sm+)
 *   - `'lg'` — modal / form density (auto-height, text-sm)
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'

export type ControlSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'h-7 w-full px-2 py-0 text-xs',
  md: 'h-8 w-full sm:w-64 flex-none px-2.5 py-0 text-xs',
  lg: 'w-full px-2 py-1.5 text-sm'
}

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  size?: ControlSize
}

export const Input: Component<InputProps> = props => {
  const [local, others] = splitProps(props, ['class', 'size'])
  return (
    <input
      class={cn(
        'rounded border border-gray-300 dark:border-gray-600',
        'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100',
        'shadow-sm',
        'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
        'placeholder-gray-400 dark:placeholder-gray-500 transition-all outline-none',
        SIZE_CLASSES[local.size ?? 'md'],
        local.class
      )}
      {...others}
    />
  )
}

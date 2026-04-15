/**
 * Textarea — A styled multiline text input with size variants.
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'
import type { ControlSize } from './Input'

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: ControlSize
}

export const Textarea: Component<TextareaProps> = props => {
  const [local, rest] = splitProps(props, ['class', 'size'])

  return (
    <textarea
      class={cn(
        'w-full flex-none rounded border border-gray-300 dark:border-gray-600',
        'bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100',
        'shadow-sm',
        'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
        'placeholder-gray-400 dark:placeholder-gray-500 transition-all resize-y outline-none',
        local.size === 'sm' ? 'min-h-16 px-2 py-1.5' : 'min-h-20 px-2.5 py-2',
        local.class
      )}
      {...rest}
    />
  )
}

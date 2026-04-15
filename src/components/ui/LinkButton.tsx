/**
 * LinkButton — A button styled as a text link (no border, underline on hover).
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'
import type { ControlSize } from './Input'

export interface LinkButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ControlSize
}

export const LinkButton: Component<LinkButtonProps> = props => {
  const [local, rest] = splitProps(props, ['class', 'children', 'size'])

  return (
    <button
      type="button"
      class={cn(
        'inline-flex items-center justify-center transition-colors text-xs font-medium',
        local.size === 'sm' ? 'h-7 px-1' : 'h-8 px-1',
        'text-blue-600 dark:text-blue-400',
        'hover:underline hover:text-blue-700 dark:hover:text-blue-300',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline',
        local.class
      )}
      {...rest}
    >
      {local.children}
    </button>
  )
}

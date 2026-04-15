/**
 * LinkButton.tsx — Text-styled button that looks like a link.
 *
 * Sizes:
 *   - `'sm'` — compact (h-7)
 *   - `'md'` — standard (h-8)
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'

import type { ControlSize } from './Input'

const SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'h-7 px-1',
  md: 'h-8 px-1',
  lg: 'h-8 px-1'
}

export interface LinkButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ControlSize
}

export const LinkButton: Component<LinkButtonProps> = props => {
  const [local, others] = splitProps(props, ['class', 'children', 'size'])
  return (
    <button
      type="button"
      class={cn(
        'inline-flex items-center justify-center transition-colors',
        SIZE_CLASSES[local.size ?? 'md'],
        'text-xs font-medium text-blue-600 dark:text-blue-400',
        'hover:underline hover:text-blue-700 dark:hover:text-blue-300',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline',
        local.class
      )}
      {...others}
    >
      {local.children}
    </button>
  )
}

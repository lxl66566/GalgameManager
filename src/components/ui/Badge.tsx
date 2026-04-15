/**
 * Badge — A small inline label / tag.
 *
 * Used for status indicators, counts, etc. (e.g. archive count in SyncModal).
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'

export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  /** Visual variant. @default 'default' */
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}

export const Badge: Component<BadgeProps> = props => {
  const [local, rest] = splitProps(props, ['class', 'variant', 'children'])
  const variant = () => local.variant ?? 'default'

  return (
    <span
      class={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium select-none whitespace-nowrap',
        variant() === 'default' &&
          'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
        variant() === 'primary' &&
          'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
        variant() === 'success' &&
          'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
        variant() === 'warning' &&
          'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        variant() === 'danger' &&
          'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
        local.class
      )}
      {...rest}
    >
      {local.children}
    </span>
  )
}

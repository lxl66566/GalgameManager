/**
 * Hint — An inline hint message with an icon (warning or error).
 *
 * Replaces the repeated warning/error patterns in FormField, GameEditModal,
 * and other places where a small icon + text hint is rendered below a field.
 */
import { cn } from '~/lib/utils'
import { FiAlertCircle, FiAlertTriangle } from 'solid-icons/fi'
import { splitProps, type Component, type JSX } from 'solid-js'

export interface HintProps {
  /** Visual variant. */
  variant: 'warning' | 'error'
  children: JSX.Element
  class?: string
}

export const Hint: Component<HintProps> = props => {
  const [local, rest] = splitProps(props, ['class', 'variant', 'children'])

  return (
    <p
      class={cn(
        'flex items-center gap-1 text-[10px] leading-tight select-none',
        local.variant === 'warning' && 'text-amber-600 dark:text-amber-400',
        local.variant === 'error' && 'text-red-600 dark:text-red-400',
        local.class
      )}
    >
      {local.variant === 'warning' ? (
        <FiAlertTriangle class="w-3 h-3 shrink-0" />
      ) : (
        <FiAlertCircle class="w-3 h-3 shrink-0" />
      )}
      {local.children}
    </p>
  )
}

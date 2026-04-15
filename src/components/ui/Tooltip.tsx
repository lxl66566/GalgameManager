/**
 * Tooltip — A thin wrapper around Kobalte's Tooltip primitive.
 *
 * Provides a consistent tooltip style across the application
 * (previously hand-crafted in FormField with inline Kobalte usage).
 */
import { Tooltip as KobalteTooltip } from '@kobalte/core/tooltip'
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'

export interface TooltipProps {
  /** Tooltip content. */
  content: JSX.Element
  /** The trigger element. */
  children: JSX.Element
  /** Delay before showing (ms). @default 0 */
  openDelay?: number
  /** Delay before hiding (ms). @default 0 */
  closeDelay?: number
  class?: string
}

export const Tooltip: Component<TooltipProps> = props => {
  const [local, rest] = splitProps(props, [
    'content',
    'children',
    'openDelay',
    'closeDelay',
    'class'
  ])

  return (
    <KobalteTooltip openDelay={local.openDelay ?? 0} closeDelay={local.closeDelay ?? 0}>
      <KobalteTooltip.Trigger class="inline-flex items-center shrink-0 cursor-help text-gray-400 dark:text-gray-500">
        {local.children}
      </KobalteTooltip.Trigger>
      <KobalteTooltip.Portal>
        <KobalteTooltip.Content
          class={cn(
            'z-50 w-max max-w-[220px] rounded px-2 py-1 text-[10px] leading-tight font-normal',
            'bg-gray-800 text-gray-100 shadow-lg',
            'dark:bg-gray-200 dark:text-gray-800',
            'animate-in fade-in',
            local.class
          )}
        >
          <KobalteTooltip.Arrow />
          {local.content}
        </KobalteTooltip.Content>
      </KobalteTooltip.Portal>
    </KobalteTooltip>
  )
}

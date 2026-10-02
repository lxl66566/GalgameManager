/**
 * HoverExpandButton — compact icon button that expands a text label on
 * hover. The width animates smoothly via grid-template-columns (0fr → 1fr)
 * instead of a width transition, so there is no layout jank.
 */
import type { Component } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import { cn } from '~/lib/utils'

interface HoverExpandButtonProps {
  /** Extra class for the root <button>, merged via cn(). */
  class?: string
  /** When true, the button is greyed out, unclickable and does not expand. */
  disabled?: boolean
  /** Icon component rendered at the leading edge. */
  icon: Component<{ class?: string }>
  /** Extra class for the icon element, merged via cn() (e.g. size overrides). */
  iconClass?: string
  label: string
  onClick: () => void
  /** Tooltip override; defaults to `label` (useful for disabled reasons). */
  title?: string
}

export default function HoverExpandButton(props: HoverExpandButtonProps) {
  return (
    <button
      class={cn(
        'group flex cursor-pointer items-center rounded p-1.5 text-gray-400 transition-all hover:bg-gray-200/50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200 dark:disabled:hover:bg-transparent dark:disabled:hover:text-gray-400',
        props.class
      )}
      disabled={props.disabled}
      onClick={() => {
        props.onClick()
      }}
      title={props.title ?? props.label}
      type="button"
    >
      <Dynamic class={cn('h-4 w-4 shrink-0', props.iconClass)} component={props.icon} />
      {/* Smooth width expansion via grid-template-columns. The disabled
          variant must override group-hover so disabled buttons stay collapsed. */}
      <div class="grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-in-out group-hover:grid-cols-[1fr] disabled:group-hover:grid-cols-[0fr]">
        <span class="overflow-hidden pl-0 text-xs font-medium whitespace-nowrap transition-all duration-300 group-hover:pl-1.5 disabled:group-hover:pl-0">
          {props.label}
        </span>
      </div>
    </button>
  )
}

/**
 * SettingRow.tsx — A single row inside a SettingSection.
 *
 * Left side: label + optional description.
 * Right side: control (children).
 */
import { cn } from '~/lib/utils'
import { Show, type Component, type JSX } from 'solid-js'

interface SettingRowProps {
  label: string | JSX.Element
  description?: string
  children: JSX.Element
  class?: string
  indent?: boolean
}

export const SettingRow: Component<SettingRowProps> = props => (
  <div
    class={cn(
      'flex items-center justify-between gap-4 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/10',
      props.indent && 'pl-6',
      props.class
    )}
  >
    <div class="flex-1 min-w-0 overflow-hidden">
      <div class="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
        {props.label}
      </div>
      <Show when={props.description}>
        <div class="text-[11px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5 truncate">
          {props.description}
        </div>
      </Show>
    </div>
    <div class="flex-shrink-0 flex items-center">{props.children}</div>
  </div>
)

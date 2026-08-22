import { Show, type Component, type JSX } from 'solid-js'

/**
 * settings.tsx — Layout composites for the Settings page.
 *
 * Re-exports primitive controls from controls.tsx under their original names
 * (default `size='md'`). Provides settings-specific layout components:
 * SettingSection, SettingRow, SettingSubGroup.
 */
import { cn } from '~/lib/utils'

// ─── Re-exports (standard density) ──────────────────────────────────────────

export {
  Button,
  Input,
  LinkButton,
  Select,
  Switch as SwitchToggle,
  Textarea
} from './controls'

// ─── SettingSection ─────────────────────────────────────────────────────────

export const SettingSection: Component<{
  children: JSX.Element
  class?: string
  title: string
}> = props => (
  <div class={cn('mb-6', props.class)}>
    <h3 class="mb-2 px-1 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
      {props.title}
    </h3>
    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {props.children}
    </div>
  </div>
)

// ─── SettingSubGroup ────────────────────────────────────────────────────────

export const SettingSubGroup: Component<{ children: JSX.Element }> = props => (
  <div class="border-t border-gray-100 bg-gray-50/50 dark:border-gray-700/50 dark:bg-gray-900/30">
    {props.children}
  </div>
)

// ─── SettingRow ──

interface SettingRowProps {
  children: JSX.Element
  class?: string
  description?: string
  indent?: boolean
  label: JSX.Element | string
}

export const SettingRow: Component<SettingRowProps> = props => (
  <div
    class={cn(
      'flex items-center justify-between gap-4 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/10',
      props.indent && 'pl-6',
      props.class
    )}
  >
    <div class="min-w-0 flex-1 overflow-hidden">
      <div class="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
        {props.label}
      </div>
      <Show when={props.description}>
        <div class="mt-0.5 truncate text-[11px] leading-tight text-gray-400 dark:text-gray-500">
          {props.description}
        </div>
      </Show>
    </div>
    {/* w-64 gives controls their standard width; `shrink min-w-0` lets the
        column narrow with the window instead of overflowing / staying rigid,
        and `justify-end` keeps small controls (switch, buttons) right-aligned. */}
    <div class="flex w-64 min-w-0 shrink items-center justify-end">{props.children}</div>
  </div>
)

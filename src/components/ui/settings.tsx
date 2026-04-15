/**
 * settings.tsx — Layout composites for the Settings page.
 *
 * Re-exports primitive controls wrapped with settings-specific width constraints.
 * Provides layout components: SettingSection, SettingRow, SettingSubGroup.
 */
import { cn } from '~/lib/utils'
import { mergeProps, Show, splitProps, type Component, type JSX } from 'solid-js'
import { Button, type ButtonProps } from './Button'
import { Input, type InputProps } from './Input'
import { LinkButton, type LinkButtonProps } from './LinkButton'
import { Select, type SelectProps } from './Select'
import { Switch } from './Switch'
import { Textarea, type TextareaProps } from './Textarea'

// ─── Settings-width wrappers ────────────────────────────────────────────────

/** Settings Input — constrains to `sm:w-64` for consistent column alignment. */
const SettingsInput: Component<InputProps> = props => {
  const [local, rest] = splitProps(props, ['class'])
  return <Input {...rest} class={cn('sm:w-64 flex-none', local.class)} />
}

/** Settings Select — constrains to `sm:w-64` for consistent column alignment. */
const SettingsSelect: Component<SelectProps> = props => {
  const [local, rest] = splitProps(props, ['class'])
  return <Select {...rest} class={cn('sm:w-64 flex-none', local.class)} />
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { SettingsInput as Input, SettingsSelect as Select, Button, Textarea, LinkButton }
export { Switch as SwitchToggle } from './Switch'

// ─── SettingSection ─────────────────────────────────────────────────────────

export const SettingSection: Component<{
  title: string
  children: JSX.Element
  class?: string
}> = props => (
  <div class={cn('mb-6', props.class)}>
    <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1 uppercase tracking-wider">
      {props.title}
    </h3>
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {props.children}
    </div>
  </div>
)

// ─── SettingSubGroup ────────────────────────────────────────────────────────

export const SettingSubGroup: Component<{ children: JSX.Element }> = props => (
  <div class="bg-gray-50/50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/50">
    {props.children}
  </div>
)

// ─── SettingRow ─────────────────────────────────────────────────────────────

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

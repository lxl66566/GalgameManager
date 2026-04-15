/**
 * FormField.tsx — Vertical field wrapper for form layouts.
 *
 * Structure: label (with optional hint tooltip) → children → warning/error.
 */
import { Tooltip } from '@kobalte/core/tooltip'
import { cn } from '~/lib/utils'
import { FiAlertCircle, FiAlertTriangle, FiInfo } from 'solid-icons/fi'
import { Show, type Component, type JSX } from 'solid-js'

export interface FormFieldProps {
  label?: string
  /** Override the label element class. */
  labelClass?: string
  description?: string
  /** Warning hint rendered below the children area (amber, icon + text). */
  warning?: string
  /** Error hint rendered below the children area (red, icon + text). */
  error?: string
  /** Override the children wrapper div class (default: `flex items-center min-h-7`). */
  childrenClass?: string
  class?: string
  children: JSX.Element
}

/** Vertical field wrapper: label (with optional hint tooltip) → children → warning/error. */
export const FormField: Component<FormFieldProps> = props => (
  <div class={cn('flex flex-col gap-1', props.class)}>
    <Show when={props.label}>
      <label
        class={cn(
          'flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 select-none',
          props.labelClass
        )}
      >
        <span class="truncate min-w-0">{props.label}</span>
        <Show when={props.description}>
          <Tooltip openDelay={0} closeDelay={0}>
            <Tooltip.Trigger class="inline-flex items-center shrink-0 cursor-help text-gray-400 dark:text-gray-500">
              <FiInfo class="w-3 h-3" />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content class="z-50 w-max max-w-[220px] rounded px-2 py-1 text-[10px] leading-tight font-normal bg-gray-800 text-gray-100 shadow-lg dark:bg-gray-200 dark:text-gray-800 animate-in fade-in">
                <Tooltip.Arrow />
                {props.description}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip>
        </Show>
      </label>
    </Show>
    <div class={props.childrenClass ?? 'flex items-center min-h-7'}>{props.children}</div>
    <Show when={props.warning}>
      <p class="flex items-center gap-1 text-[10px] leading-tight text-amber-600 dark:text-amber-400 select-none">
        <FiAlertTriangle class="w-3 h-3 shrink-0" />
        {props.warning}
      </p>
    </Show>
    <Show when={props.error}>
      <p class="flex items-center gap-1 text-[10px] leading-tight text-red-600 dark:text-red-400 select-none">
        <FiAlertCircle class="w-3 h-3 shrink-0" />
        {props.error}
      </p>
    </Show>
  </div>
)

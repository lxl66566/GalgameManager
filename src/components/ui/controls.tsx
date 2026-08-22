import type { SwitchRootProps } from '@kobalte/core/switch'
/**
 * controls.tsx — Unified primitive form controls with size variants.
 *
 * Every control accepts a `size` prop:
 *   - `'sm'` — compact density for inline forms & modal editors
 *   - `'md'` — standard density for settings pages (default)
 *
 * These are the single source of truth; higher-level wrappers
 * (form.tsx, settings.tsx) re-export or compose on top.
 */
import * as KobalteSwitch from '@kobalte/core/switch'
import { For, splitProps, type Component, type JSX } from 'solid-js'

import { cn } from '~/lib/utils'

// ─── Size type ────

export type ControlSize = 'md' | 'sm'

// ─── Shared token maps ──────────────────────────────────────────────────────

const INPUT_SIZES: Record<ControlSize, string> = {
  // Fixed width (not `w-full sm:w-64`): inside SettingRow's shrink-to-fit
  // flex container a percentage width collapses to the control's intrinsic
  // size below the sm breakpoint, which made narrow-window widths differ per
  // control type.
  md: 'h-8 w-64 flex-none px-2.5 py-0',
  sm: 'h-7 w-full px-2 py-0'
}

const SELECT_WRAPPER_SIZES: Record<ControlSize, string> = {
  md: 'relative w-64 flex-none',
  sm: 'relative'
}

const SELECT_SIZES: Record<ControlSize, string> = {
  md: 'h-8 w-full pl-2.5 pr-8 py-0',
  sm: 'h-7 w-full pl-2 pr-7 py-0'
}

const SWITCH_TRACK: Record<ControlSize, string> = {
  md: 'w-9 h-3',
  sm: 'w-8 h-3'
}

const SWITCH_THUMB: Record<ControlSize, string> = {
  md: 'size-4',
  sm: 'size-3.5'
}

const SWITCH_TRANSLATE: Record<ControlSize, string> = {
  md: 'group-data-[checked]:translate-x-5',
  sm: 'group-data-[checked]:translate-x-[18px]'
}

const BUTTON_SIZES: Record<ControlSize | 'icon' | 'lg', string> = {
  icon: 'p-2 text-sm',
  lg: 'px-4 py-2 text-sm',
  md: 'h-8 px-3 text-xs',
  sm: 'h-7 px-2.5 text-xs'
}

export type ButtonVariant = 'danger' | 'ghost-danger' | 'outline' | 'primary' | 'secondary'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  danger:
    'bg-red-500 hover:bg-red-600 text-white dark:bg-red-600 dark:hover:bg-red-700 shadow-sm',
  'ghost-danger': 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20',
  outline:
    'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800',
  primary: 'bg-blue-600 hover:bg-blue-700 text-white dark:hover:bg-blue-500 shadow-sm',
  secondary: 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
}

const TEXTAREA_SIZES: Record<ControlSize, string> = {
  md: 'min-h-20 px-2.5 py-2',
  sm: 'min-h-16 px-2 py-1.5'
}

const LINK_BTN_SIZES: Record<ControlSize, string> = {
  md: 'h-8 px-1',
  sm: 'h-7 px-1'
}

// ─── Input ────────

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  size?: ControlSize
}

export const Input: Component<InputProps> = props => {
  const [local, others] = splitProps(props, ['class', 'size'])
  return (
    <input
      class={cn(
        'rounded border border-gray-300 dark:border-gray-600',
        'bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100',
        'shadow-sm',
        'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
        'placeholder-gray-400 dark:placeholder-gray-500 transition-all outline-none',
        INPUT_SIZES[local.size ?? 'md'],
        local.class
      )}
      {...others}
    />
  )
}

// ─── Select ───────

export interface SelectProps extends Omit<
  JSX.SelectHTMLAttributes<HTMLSelectElement>,
  'options'
> {
  options: { label: string; value: number | string }[]
  size?: ControlSize
}

export const Select: Component<SelectProps> = props => {
  const [local, others] = splitProps(props, ['class', 'options', 'value', 'size'])
  const s = () => local.size ?? 'md'
  return (
    <div class={cn(SELECT_WRAPPER_SIZES[s()], local.class)}>
      <select
        class={cn(
          'block w-full rounded border border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100',
          'shadow-sm',
          'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
          'appearance-none cursor-pointer transition-all outline-none truncate',
          SELECT_SIZES[s()]
        )}
        value={local.value}
        {...others}
      >
        <For each={local.options}>
          {opt => (
            <option selected={opt.value === local.value} value={opt.value}>
              {opt.label}
            </option>
          )}
        </For>
      </select>
      {/* Chevron icon */}
      <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-gray-400">
        <svg
          class={cn(s() === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M19 9l-7 7-7-7"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
          />
        </svg>
      </div>
    </div>
  )
}

// ─── Switch ───────

export interface SwitchProps extends SwitchRootProps {
  class?: string
  size?: ControlSize
}

export const Switch: Component<SwitchProps> = props => {
  const [local, others] = splitProps(props, ['class', 'onChange', 'checked', 'size'])
  const s = () => local.size ?? 'md'
  return (
    <KobalteSwitch.Root
      checked={local.checked}
      class={cn('group inline-flex items-center', local.class)}
      onChange={local.onChange}
      {...others}
    >
      <KobalteSwitch.Input />
      <KobalteSwitch.Control
        class={cn(
          'relative rounded-full transition-colors duration-200 cursor-pointer',
          SWITCH_TRACK[s()],
          'bg-gray-300/50 dark:bg-gray-600/50',
          'group-data-[checked]:bg-blue-500/60',
          'group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-blue-500/50 group-data-[focus-visible]:ring-offset-2 dark:group-data-[focus-visible]:ring-offset-gray-900',
          'group-data-[disabled]:opacity-50 group-data-[disabled]:cursor-not-allowed'
        )}
      >
        <KobalteSwitch.Thumb
          class={cn(
            'block rounded-full bg-white shadow-md ring-0 transition-transform duration-200',
            'absolute top-1/2 left-0 -translate-y-1/2',
            SWITCH_THUMB[s()],
            SWITCH_TRANSLATE[s()],
            'group-data-[disabled]:bg-gray-100 dark:group-data-[disabled]:bg-gray-400'
          )}
        />
      </KobalteSwitch.Control>
    </KobalteSwitch.Root>
  )
}

// ─── Button ───────

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 'md'/'sm' are the settings-page densities; 'lg' matches the modal
   *  footer buttons; 'icon' is a square icon-only button. */
  size?: ControlSize | 'icon' | 'lg'
  /** Visual style. 'outline' (default) is the settings-page bordered look;
   *  the others are the solid/ghost styles formerly in ui/Button.tsx. */
  variant?: ButtonVariant
}

export const Button: Component<ButtonProps> = props => {
  const [local, others] = splitProps(props, [
    'class',
    'children',
    'type',
    'size',
    'variant'
  ])
  return (
    <button
      class={cn(
        'inline-flex items-center justify-center gap-1.5 rounded font-medium whitespace-nowrap transition-all',
        BUTTON_SIZES[local.size ?? 'md'],
        BUTTON_VARIANTS[local.variant ?? 'outline'],
        'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        local.class
      )}
      type={local.type ?? 'button'}
      {...others}
    >
      {local.children}
    </button>
  )
}

// ─── Textarea ─────

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: ControlSize
}

export const Textarea: Component<TextareaProps> = props => {
  const [local, others] = splitProps(props, ['class', 'size'])
  return (
    <textarea
      class={cn(
        'w-full flex-none rounded border border-gray-300 dark:border-gray-600',
        'bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100',
        'shadow-sm',
        'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
        'placeholder-gray-400 dark:placeholder-gray-500 transition-all resize-y outline-none',
        TEXTAREA_SIZES[local.size ?? 'md'],
        local.class
      )}
      {...others}
    />
  )
}

// ─── LinkButton ───

export interface LinkButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ControlSize
}

export const LinkButton: Component<LinkButtonProps> = props => {
  const [local, others] = splitProps(props, ['class', 'children', 'size'])
  return (
    <button
      class={cn(
        'inline-flex items-center justify-center transition-colors',
        LINK_BTN_SIZES[local.size ?? 'md'],
        'text-xs font-medium text-blue-600 dark:text-blue-400',
        'hover:underline hover:text-blue-700 dark:hover:text-blue-300',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline',
        local.class
      )}
      type="button"
      {...others}
    >
      {local.children}
    </button>
  )
}

/**
 * Button.tsx — Unified button with variant & size support.
 *
 * Variants:
 *   - `'default'` — bordered, white bg (standard action)
 *   - `'primary'` — blue bg, white text (confirm / CTA)
 *   - `'danger'`  — red text, transparent bg (destructive action)
 *   - `'ghost'`   — gray text, transparent bg (cancel / secondary)
 *
 * Sizes:
 *   - `'sm'` — compact (h-7)
 *   - `'md'` — standard (h-8)
 *   - `'lg'` — modal / form (px-4 py-2, text-sm)
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost'
export type { ControlSize } from './Input'
import type { ControlSize } from './Input'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: cn(
    'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900',
    'text-gray-700 dark:text-gray-200',
    'hover:bg-gray-50 dark:hover:bg-gray-800',
    'shadow-sm'
  ),
  primary: cn(
    'border-transparent bg-blue-600 dark:bg-blue-600',
    'text-white',
    'hover:bg-blue-700 dark:hover:bg-blue-500',
    'shadow-sm'
  ),
  danger: cn(
    'border-transparent',
    'text-red-600 dark:text-red-400',
    'hover:bg-red-50 dark:hover:bg-red-900/20'
  ),
  ghost: cn(
    'border-transparent',
    'text-gray-700 dark:text-gray-300',
    'hover:bg-gray-100 dark:hover:bg-gray-800'
  )
}

const SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-xs',
  lg: 'px-4 py-2 text-sm'
}

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ControlSize
  variant?: ButtonVariant
}

export const Button: Component<ButtonProps> = props => {
  const [local, others] = splitProps(props, ['class', 'children', 'type', 'size', 'variant'])
  return (
    <button
      type={local.type ?? 'button'}
      class={cn(
        'inline-flex items-center justify-center rounded border transition-all',
        'font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT_CLASSES[local.variant ?? 'default'],
        SIZE_CLASSES[local.size ?? 'md'],
        local.class
      )}
      {...others}
    >
      {local.children}
    </button>
  )
}

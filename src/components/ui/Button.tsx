/**
 * Button — A styled button with variant and size support.
 *
 * Variants:
 *   - default: white background, gray border (standard action button)
 *   - primary: blue background, white text (confirm / main action)
 *   - danger: red-tinted (destructive actions)
 *   - ghost: transparent, hover-only background (subtle actions)
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'

export type ButtonSize = 'xs' | 'sm' | 'md'

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost'

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize
  variant?: ButtonVariant
}

export const Button: Component<ButtonProps> = props => {
  const [local, rest] = splitProps(props, [
    'class',
    'children',
    'type',
    'size',
    'variant'
  ])
  const variant = () => local.variant ?? 'default'
  const size = () => local.size ?? 'md'

  return (
    <button
      type={local.type ?? 'button'}
      class={cn(
        'inline-flex items-center justify-center rounded transition-all outline-none',
        // Size
        size() === 'xs'
          ? 'h-6 px-2 text-xs'
          : size() === 'sm'
            ? 'h-7 px-2.5 text-xs'
            : 'h-8 px-3 text-xs',
        // Variant: default
        variant() === 'default' &&
          cn(
            'border border-gray-300 dark:border-gray-600 shadow-sm',
            'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200',
            'hover:bg-gray-50 dark:hover:bg-gray-800',
            'focus:ring-2 focus:ring-blue-500/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          ),
        // Variant: primary
        variant() === 'primary' &&
          cn(
            'border-0 shadow-sm',
            'bg-blue-600 text-white',
            'hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500',
            'focus:ring-2 focus:ring-blue-500/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          ),
        // Variant: danger
        variant() === 'danger' &&
          cn(
            'border-0',
            'bg-red-100 text-red-600 hover:bg-red-200',
            'dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50',
            'focus:ring-2 focus:ring-red-500/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          ),
        // Variant: ghost
        variant() === 'ghost' &&
          cn(
            'border-0 bg-transparent',
            'text-gray-700 dark:text-gray-200',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            'focus:ring-2 focus:ring-blue-500/50',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          ),
        local.class
      )}
      {...rest}
    >
      {local.children}
    </button>
  )
}

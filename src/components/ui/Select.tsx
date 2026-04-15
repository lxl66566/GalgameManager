/**
 * Select — A styled native select with a chevron icon and size variants.
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'
import type { ControlSize } from './Input'

export interface SelectProps extends Omit<
  JSX.SelectHTMLAttributes<HTMLSelectElement>,
  'options'
> {
  options: { label: string; value: string | number }[]
  size?: ControlSize
}

export const Select: Component<SelectProps> = props => {
  const [local, rest] = splitProps(props, ['class', 'options', 'value', 'size'])
  const size = () => local.size ?? 'md'

  return (
    <div
      class={cn(
        size() === 'sm' ? 'relative' : 'relative w-full sm:w-64 flex-none',
        local.class
      )}
    >
      <select
        class={cn(
          'block w-full rounded border border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100',
          'shadow-sm',
          'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
          'appearance-none cursor-pointer transition-all outline-none truncate',
          size() === 'sm' ? 'h-7 w-full pl-2 pr-7 py-0' : 'h-8 w-full pl-2.5 pr-8 py-0'
        )}
        value={local.value}
        {...rest}
      >
        {local.options.map(opt => (
          <option value={opt.value} selected={opt.value === local.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {/* Chevron icon */}
      <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center text-gray-400 px-1.5">
        <svg
          class={size() === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  )
}

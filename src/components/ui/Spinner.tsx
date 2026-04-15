/**
 * Spinner — A simple animated loading spinner.
 *
 * Replaces the repeated inline SVG spinners found across the codebase.
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component } from 'solid-js'

export interface SpinnerProps {
  /** Visual size. @default 'md' */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  class?: string
}

const SIZE_MAP: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8'
}

export const Spinner: Component<SpinnerProps> = props => {
  const [local] = splitProps(props, ['class', 'size'])
  const size = () => local.size ?? 'md'

  return (
    <svg
      class={cn('animate-spin text-current', SIZE_MAP[size()], local.class)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

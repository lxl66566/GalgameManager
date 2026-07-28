// ─── FieldHint ───

import { cn } from '~/lib/utils'
import { FiAlertCircle, FiAlertTriangle, FiInfo } from 'solid-icons/fi'
import { type Component, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'

export interface FieldHintProps {
  /** Arbitrary content rendered next to the icon. Mutually exclusive with `text`. */
  children?: JSX.Element
  /** Override the outer `<p>` element class. */
  class?: string
  /** Override the icon element class (default size is `w-3 h-3`). */
  iconClass?: string
  /** Hint text rendered next to the icon. Mutually exclusive with `children`. */
  text?: string
  /** Controls which icon and default text color to use. */
  variant: FieldHintVariant
}

/** Visual variant of a field hint — determines the icon and default color. */
export type FieldHintVariant = 'error' | 'tip' | 'warning'

const VARIANT_DEFAULTS: Record<
  FieldHintVariant,
  { icon: Component<{ class?: string }>; textClass: string }
> = {
  error: {
    icon: FiAlertCircle,
    textClass: 'text-red-600 dark:text-red-400'
  },
  tip: {
    icon: FiInfo,
    textClass: 'text-blue-600 dark:text-blue-400'
  },
  warning: {
    icon: FiAlertTriangle,
    textClass: 'text-amber-600 dark:text-amber-400'
  }
}

/**
 * A compact inline hint row (icon + text) placed below form fields.
 *
 * Supports `warning`, `error`, and `tip` variants out of the box.
 * Pass `text` for a simple string, or `children` for arbitrary JSX.
 */
export const FieldHint: Component<FieldHintProps> = props => {
  const config = () => VARIANT_DEFAULTS[props.variant]

  return (
    <p
      class={cn(
        'flex items-center gap-1 text-[10px] leading-tight select-none',
        config().textClass,
        props.class
      )}
    >
      <Dynamic
        class={cn('w-3 h-3 shrink-0', props.iconClass)}
        component={config().icon}
      />
      {props.text ?? props.children}
    </p>
  )
}

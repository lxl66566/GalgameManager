/**
 * Divider — A thin horizontal rule for visual separation.
 *
 * Replaces scattered `<hr class="border-gray-300 dark:border-gray-700 ...">` across pages.
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component, type JSX } from 'solid-js'

export interface DividerProps extends JSX.HTMLAttributes<HTMLHRElement> {
  /** Vertical spacing. @default 'md' */
  spacing?: 'none' | 'sm' | 'md' | 'lg'
}

export const Divider: Component<DividerProps> = props => {
  const [local, rest] = splitProps(props, ['class', 'spacing'])
  const spacing = () => local.spacing ?? 'md'

  return (
    <hr
      class={cn(
        'border-0 border-t border-gray-200 dark:border-gray-700',
        spacing() === 'none' && '',
        spacing() === 'sm' && 'my-1',
        spacing() === 'md' && 'my-3',
        spacing() === 'lg' && 'my-5',
        local.class
      )}
      {...rest}
    />
  )
}

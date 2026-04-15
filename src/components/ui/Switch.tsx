/**
 * Switch — A toggle switch built on Kobalte's Switch primitive.
 */
import * as KobalteSwitch from '@kobalte/core/switch'
import { cn } from '~/lib/utils'
import { splitProps, type Component } from 'solid-js'
import type { ControlSize } from './Input'

export interface SwitchProps extends KobalteSwitch.SwitchRootProps {
  size?: ControlSize
  class?: string
}

export const Switch: Component<SwitchProps> = props => {
  const [local, others] = splitProps(props, ['class', 'onChange', 'checked', 'size'])
  const size = () => local.size ?? 'md'

  return (
    <KobalteSwitch.Root
      class={cn('group inline-flex items-center', local.class)}
      onChange={local.onChange}
      checked={local.checked}
      {...others}
    >
      <KobalteSwitch.Input />
      <KobalteSwitch.Control
        class={cn(
          'relative rounded-full transition-colors duration-200 cursor-pointer',
          size() === 'sm' ? 'w-8 h-3' : 'w-9 h-3',
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
            size() === 'sm' ? 'size-3.5' : 'size-4',
            size() === 'sm'
              ? 'group-data-[checked]:translate-x-[18px]'
              : 'group-data-[checked]:translate-x-5',
            'group-data-[disabled]:bg-gray-100 dark:group-data-[disabled]:bg-gray-400'
          )}
        />
      </KobalteSwitch.Control>
    </KobalteSwitch.Root>
  )
}

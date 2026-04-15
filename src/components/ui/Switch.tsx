/**
 * Switch.tsx — Toggle switch built on Kobalte's Switch primitive.
 *
 * Sizes:
 *   - `'sm'` — compact density (w-8 track)
 *   - `'md'` — standard density (w-9 track)
 */
import * as KobalteSwitch from '@kobalte/core/switch'
import { cn } from '~/lib/utils'
import { splitProps, type Component } from 'solid-js'

import type { ControlSize } from './Input'

const TRACK_CLASSES: Record<ControlSize, string> = {
  sm: 'w-8 h-3',
  md: 'w-9 h-3',
  lg: 'w-9 h-3'
}

const THUMB_CLASSES: Record<ControlSize, string> = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-4'
}

const THUMB_TRANSLATE: Record<ControlSize, string> = {
  sm: 'group-data-[checked]:translate-x-[18px]',
  md: 'group-data-[checked]:translate-x-5',
  lg: 'group-data-[checked]:translate-x-5'
}

export interface SwitchProps extends KobalteSwitch.SwitchRootProps {
  size?: ControlSize
  class?: string
}

export const Switch: Component<SwitchProps> = props => {
  const [local, others] = splitProps(props, ['class', 'onChange', 'checked', 'size'])
  const s = () => local.size ?? 'md'
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
          TRACK_CLASSES[s()],
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
            THUMB_CLASSES[s()],
            THUMB_TRANSLATE[s()],
            'group-data-[disabled]:bg-gray-100 dark:group-data-[disabled]:bg-gray-400'
          )}
        />
      </KobalteSwitch.Control>
    </KobalteSwitch.Root>
  )
}

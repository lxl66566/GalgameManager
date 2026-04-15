/**
 * FormSwitch.tsx — Compact Switch wrapper defaulting to `size='sm'`.
 */
import { mergeProps, type Component } from 'solid-js'

import { Switch, type SwitchProps } from './Switch'

export const FormSwitch: Component<SwitchProps> = props => {
  const mergedProps = mergeProps({ size: 'sm' as const }, props)
  return <Switch {...mergedProps} />
}

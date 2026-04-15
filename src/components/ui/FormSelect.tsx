/**
 * FormSelect.tsx — Compact Select wrapper defaulting to `size='sm'`.
 */
import { mergeProps, type Component } from 'solid-js'

import { Select, type SelectProps } from './Select'

export const FormSelect: Component<SelectProps> = props => {
  const mergedProps = mergeProps({ size: 'sm' as const }, props)
  return <Select {...mergedProps} />
}

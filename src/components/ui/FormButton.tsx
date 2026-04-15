/**
 * FormButton.tsx — Compact Button wrapper defaulting to `size='sm'`.
 */
import { mergeProps, type Component } from 'solid-js'

import { Button, type ButtonProps } from './Button'

export const FormButton: Component<ButtonProps> = props => {
  const mergedProps = mergeProps({ size: 'sm' as const }, props)
  return <Button {...mergedProps} />
}

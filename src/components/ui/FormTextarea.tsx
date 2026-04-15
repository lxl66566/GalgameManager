/**
 * FormTextarea.tsx — Compact Textarea wrapper defaulting to `size='sm'`.
 */
import { mergeProps, type Component } from 'solid-js'

import { Textarea, type TextareaProps } from './Textarea'

export const FormTextarea: Component<TextareaProps> = props => {
  const mergedProps = mergeProps({ size: 'sm' as const }, props)
  return <Textarea {...mergedProps} />
}

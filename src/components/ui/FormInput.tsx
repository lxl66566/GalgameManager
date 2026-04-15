/**
 * FormInput.tsx — Compact Input wrapper with paste-aware bulk-input support.
 *
 * Defaults to `size='sm'`. Accepts all standard Input props.
 */
import { cn } from '~/lib/utils'
import { splitProps, type Component } from 'solid-js'

import { Input, type InputProps } from './Input'

export interface FormInputProps extends InputProps {
  /**
   * Transform function applied when the value is pasted into the input.
   * Receives the raw pasted text and must return the transformed string.
   */
  onBulkInput?: (value: string) => string
}

export const FormInput: Component<FormInputProps> = props => {
  const [local, rest] = splitProps(props, ['class', 'size', 'onBulkInput', 'onInput'])
  return (
    <Input
      size={local.size ?? 'sm'}
      class={cn(local.class)}
      {...rest}
      onInput={e => {
        if (e.inputType === 'insertFromPaste' && local.onBulkInput) {
          const input = e.currentTarget
          const transformed = local.onBulkInput(input.value)
          if (transformed !== input.value) {
            input.value = transformed
          }
        }
        if (typeof local.onInput === 'function') {
          local.onInput(e)
        }
      }}
    />
  )
}

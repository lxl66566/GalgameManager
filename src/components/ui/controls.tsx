/**
 * controls.tsx — Re-export barrel for primitive form controls.
 *
 * Components live in their own files under ui/. This module re-exports
 * them with the same public API so existing imports stay valid:
 *
 *   import { Button, Input, Select, Switch, Textarea, LinkButton } from './controls'
 */
export { Button } from './Button'
export type { ButtonProps, ButtonVariant } from './Button'

export { Input } from './Input'
export type { InputProps, ControlSize } from './Input'

export { Select } from './Select'
export type { SelectProps } from './Select'

export { Switch } from './Switch'
export type { SwitchProps } from './Switch'

export { Textarea } from './Textarea'
export type { TextareaProps } from './Textarea'

export { LinkButton } from './LinkButton'
export type { LinkButtonProps } from './LinkButton'

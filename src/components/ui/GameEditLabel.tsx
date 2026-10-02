/**
 * Form label for GameEditModal-style dialogs; unified font size and color
 * (dark-mode aware).
 */

import { splitProps, type JSX } from 'solid-js'

import { cn } from '~/lib/utils'

export const MODAL_LABEL = 'text-sm font-bold text-gray-700 dark:text-gray-300'

export function GameEditLabel(props: JSX.LabelHTMLAttributes<HTMLLabelElement>) {
  const [local, rest] = splitProps(props, ['class'])

  return <label class={cn(MODAL_LABEL, local.class)} {...rest} />
}

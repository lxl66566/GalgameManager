/**
 * Basic single-line input (modal/form density) for dialogs like GameEditModal.
 * For settings-page density use the Input in controls.tsx (different size tokens).
 */

import { splitProps, type JSX } from 'solid-js'

import { cn } from '~/lib/utils'

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [local, rest] = splitProps(props, ['class'])

  return (
    <input
      class={cn(
        'w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600',
        'rounded px-2 py-1 text-sm text-gray-900 dark:text-white',
        'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
        local.class
      )}
      {...rest}
    />
  )
}

/**
 * Input with a trailing suffix label (e.g. units like hours, minutes, MB).
 */

import { splitProps, type JSX } from 'solid-js'

import { cn } from '~/lib/utils'

import { Input } from './Input'

interface InputWithSuffixProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  containerClass?: string
  suffix: string
}

export function InputWithSuffix(props: InputWithSuffixProps) {
  const [local, rest] = splitProps(props, ['suffix', 'containerClass', 'class'])

  return (
    <div class={cn('relative flex-1', local.containerClass)}>
      <Input class={cn('pr-9', local.class)} {...rest} />
      <span class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400">
        {local.suffix}
      </span>
    </div>
  )
}

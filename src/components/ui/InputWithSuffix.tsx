/**
 * 带后缀文本的输入框组件
 * 适用于需要显示单位（如：小时、分钟、MB）的场景
 */

import { cn } from '~/lib/utils'
import { splitProps, type JSX } from 'solid-js'
import { Input } from './Input'

interface InputWithSuffixProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  suffix: string
  containerClass?: string
}

export function InputWithSuffix(props: InputWithSuffixProps) {
  const [local, rest] = splitProps(props, ['suffix', 'containerClass', 'class'])

  return (
    <div class={cn('relative flex-1', local.containerClass)}>
      <Input class={cn('pr-9', local.class)} {...rest} />
      <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none">
        {local.suffix}
      </span>
    </div>
  )
}

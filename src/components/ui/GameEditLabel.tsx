/**
 * 基础表单标签组件，主要用于 GameEditModal 组件
 * 提供统一的字体大小和颜色（支持暗黑模式）
 */

import { cn } from '~/lib/utils'
import { splitProps, type JSX } from 'solid-js'

export const MODAL_LABEL = 'text-sm font-bold text-gray-700 dark:text-gray-300'

export function GameEditLabel(props: JSX.LabelHTMLAttributes<HTMLLabelElement>) {
  const [local, rest] = splitProps(props, ['class'])

  return <label class={cn(MODAL_LABEL, local.class)} {...rest} />
}

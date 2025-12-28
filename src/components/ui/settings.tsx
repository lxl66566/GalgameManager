import { clsx } from 'clsx'
import { Show, splitProps, type Component, type JSX } from 'solid-js'

// 1. 设置区块容器：保留边框，但更紧凑
export const SettingSection: Component<{
  title: string
  children: JSX.Element
  class?: string
}> = props => (
  <div class={clsx('mb-6', props.class)}>
    <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1 uppercase tracking-wider">
      {props.title}
    </h3>
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {props.children}
    </div>
  </div>
)

// 2. 子选项容器：用于包裹展开的配置项（如 WebDAV 的详情），带轻微背景色
export const SettingSubGroup: Component<{ children: JSX.Element }> = props => (
  <div class="bg-gray-50/50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/50">
    {props.children}
  </div>
)

// 3. 单个设置行：大幅减少 Padding，使用 Flex 布局保证紧凑
interface SettingRowProps {
  label: string
  description?: string
  children: JSX.Element
  class?: string
  // 是否是子项（增加左侧缩进）
  indent?: boolean
}

export const SettingRow: Component<SettingRowProps> = props => (
  <div
    class={clsx(
      'flex items-center justify-between gap-4 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/10',
      props.indent && 'pl-6', // 子项缩进
      props.class
    )}
  >
    <div class="flex-1 min-w-0 overflow-hidden">
      <div class="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
        {props.label}
      </div>
      <Show when={props.description}>
        <div class="text-[11px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5 truncate">
          {props.description}
        </div>
      </Show>
    </div>
    <div class="flex-shrink-0 flex items-center">{props.children}</div>
  </div>
)

// 4. 输入框：高度固定 h-8，字体更小
export const Input: Component<JSX.InputHTMLAttributes<HTMLInputElement>> = props => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <input
      class={clsx(
        'block w-48 h-8 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900',
        'text-xs text-gray-900 dark:text-gray-100 shadow-sm',
        'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
        'px-2.5 py-0 placeholder-gray-400 transition-all',
        local.class
      )}
      {...others}
    />
  )
}

// 5. 选择框：高度固定 h-8
export const Select: Component<
  JSX.SelectHTMLAttributes<HTMLSelectElement> & {
    options: { label: string; value: string | number }[]
  }
> = props => {
  const [local, others] = splitProps(props, ['class', 'options'])
  return (
    <div class="relative">
      <select
        class={clsx(
          'block w-40 h-8 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900',
          'text-xs text-gray-900 dark:text-gray-100 shadow-sm',
          'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
          'pl-2.5 pr-8 py-0 appearance-none cursor-pointer transition-all',
          local.class
        )}
        {...others}
      >
        {local.options.map(opt => (
          <option value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {/* 紧凑的箭头图标 */}
      <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
        <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </div>
  )
}

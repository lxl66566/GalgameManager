import * as Switch from '@kobalte/core/switch' // 引入 Kobalte Switch
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
  label: string | JSX.Element
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

// 4. 输入框
export const Input: Component<JSX.InputHTMLAttributes<HTMLInputElement>> = props => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <input
      class={clsx(
        // 布局核心：默认占满，sm(640px)以上固定宽度，flex-none 防止被压缩
        'block w-full sm:w-64 h-8 flex-none',
        'rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900',
        'text-xs text-gray-900 dark:text-gray-100 shadow-sm',
        'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
        'px-2.5 py-0 placeholder-gray-400 transition-all',
        local.class
      )}
      {...others}
    />
  )
}

// 5. 选择框
export const Select: Component<
  JSX.SelectHTMLAttributes<HTMLSelectElement> & {
    options: { label: string; value: string | number }[]
  }
> = props => {
  const [local, others] = splitProps(props, ['class', 'options', 'value'])

  return (
    // 外层容器：与 Input 保持完全一致的宽度逻辑 (w-full sm:w-64)
    <div class={clsx('relative w-full sm:w-64 flex-none', local.class)}>
      <select
        class={clsx(
          'block w-full h-8', // 内部填满外层容器
          'rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900',
          'text-xs text-gray-900 dark:text-gray-100 shadow-sm',
          'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
          'pl-2.5 pr-8 py-0 appearance-none cursor-pointer transition-all',
          'truncate' // 防止文字过长撑破
        )}
        value={local.value}
        {...others}
      >
        {local.options.map(opt => (
          <option value={opt.value} selected={opt.value === local.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* 箭头图标 */}
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

// 6. 通用按钮：高度固定 h-8，适配亮暗色
export const Button: Component<JSX.ButtonHTMLAttributes<HTMLButtonElement>> = props => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <button
      type="button"
      class={clsx(
        'inline-flex items-center justify-center h-8 px-3 rounded border shadow-sm transition-all',
        'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900',
        'text-xs font-medium text-gray-700 dark:text-gray-200',
        'hover:bg-gray-50 dark:hover:bg-gray-800',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-900',
        local.class
      )}
      {...others}
    >
      {local.children}
    </button>
  )
}

// 7. 滑动开关 (Switch)：细条透明风格
export const SwitchToggle: Component<
  Switch.SwitchRootProps & {
    class?: string
  }
> = props => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <Switch.Root
      class={clsx(
        'group inline-flex items-center', // 保持行内布局且垂直居中
        local.class
      )}
      {...others}
    >
      <Switch.Input />
      <Switch.Control
        class={clsx(
          // 布局与尺寸：细条轨道
          'relative w-9 h-3 rounded-full transition-colors duration-200 cursor-pointer',

          // 颜色与透明度：默认灰色半透明，选中时品牌色半透明
          'bg-gray-300/50 dark:bg-gray-600/50',
          'group-data-[checked]:bg-blue-500/60',

          // 聚焦状态：外圈光环
          'group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-blue-500/50 group-data-[focus-visible]:ring-offset-2 dark:group-data-[focus-visible]:ring-offset-gray-900',

          // 禁用状态
          'group-data-[disabled]:opacity-50 group-data-[disabled]:cursor-not-allowed'
        )}
      >
        <Switch.Thumb
          class={clsx(
            // 滑块样式：白色实心，带阴影，比轨道大
            'block size-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-200',

            // 定位：绝对定位实现垂直居中
            'absolute top-1/2 left-0 -translate-y-1/2',

            // 动画：选中时向右移动 (w-9=36px, size-4=16px, 差值20px=translate-x-5)
            'group-data-[checked]:translate-x-5',

            // 禁用时的滑块颜色调整
            'group-data-[disabled]:bg-gray-100 dark:group-data-[disabled]:bg-gray-400'
          )}
        />
      </Switch.Control>
    </Switch.Root>
  )
}

// 8. 多行文本输入框 (Textarea)
export const Textarea: Component<
  JSX.TextareaHTMLAttributes<HTMLTextAreaElement>
> = props => {
  const [local, others] = splitProps(props, ['class'])
  return (
    <textarea
      class={clsx(
        // 布局核心：默认占满，min-h-20，flex-none 防止被压缩
        'block w-full min-h-20 flex-none',
        'rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900',
        'text-xs text-gray-900 dark:text-gray-100 shadow-sm',
        'focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
        'px-2.5 py-2 placeholder-gray-400 transition-all', // 增加垂直 padding
        'resize-y', // 允许垂直方向调整大小
        local.class
      )}
      {...others}
    />
  )
}

// 9. 链接样式按钮 (LinkButton)
export const LinkButton: Component<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>
> = props => {
  const [local, others] = splitProps(props, ['class', 'children'])
  return (
    <button
      type="button"
      class={clsx(
        'inline-flex items-center justify-center h-8 px-1 transition-colors', // 减少 padding
        'text-xs font-medium text-blue-600 dark:text-blue-400',
        'hover:underline hover:text-blue-700 dark:hover:text-blue-300',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline',
        local.class
      )}
      {...others}
    >
      {local.children}
    </button>
  )
}

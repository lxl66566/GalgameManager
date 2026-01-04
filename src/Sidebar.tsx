import { clsx } from 'clsx'
import { splitProps, type JSX } from 'solid-js'

interface SidebarItemProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  label: string
  icon: JSX.Element
  href: string
  active?: boolean // 新增：用于控制选中状态
}

const SidebarItem = (props: SidebarItemProps) => {
  // 分离出 active 和 children，其余透传给 a 标签
  const [local, others] = splitProps(props, ['label', 'icon', 'active', 'class'])

  return (
    <a
      class={clsx(
        // 基础布局与过渡
        'group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ease-in-out outline-none',
        // 字体设置
        'text-sm font-medium',
        // 状态样式 (Active vs Inactive)
        local.active
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
          : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        // 聚焦状态 (A11y)
        'focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600',
        local.class
      )}
      {...others}
    >
      {/* 图标容器：固定宽度防止文字显隐时抖动，并处理图标颜色 */}
      <span
        class={clsx(
          'flex items-center justify-center text-lg transition-colors',
          local.active
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200'
        )}
      >
        {local.icon}
      </span>

      {/* 文字：响应式显示 */}
      <span class="hidden md:block whitespace-nowrap opacity-0 md:opacity-100 transition-opacity duration-300">
        {local.label}
      </span>
    </a>
  )
}

const Sidebar = (props: { children: JSX.Element; class?: string }) => {
  return (
    <aside
      class={clsx(
        // 容器布局
        'flex flex-col h-full py-4 px-3 space-y-2 overflow-y-auto',
        // 滚动条隐藏
        'scrollbar-hide',
        // Light 模式外观
        'bg-slate-50 border-r border-slate-200',
        // Dark 模式外观
        'dark:bg-slate-900 dark:border-slate-800',
        // 宽度过渡
        'transition-[width,background-color,border-color] duration-300 ease-in-out',
        // 禁止拖拽
        'drag-none',
        props.class
      )}
    >
      {props.children}
    </aside>
  )
}

export { SidebarItem, Sidebar }

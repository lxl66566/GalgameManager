import { A, useLocation } from '@solidjs/router'
import { createMemo, splitProps, type JSX } from 'solid-js'

import { cn } from '~/lib/utils'

interface SidebarItemProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  icon: JSX.Element
  label: string
}

const SidebarItem = (props: SidebarItemProps) => {
  const location = useLocation()
  // Active is derived from the current path so the icon/label colours can
  // react too, not just the anchor's own class.
  const active = createMemo(() => location.pathname === props.href)
  const [local, others] = splitProps(props, ['label', 'icon', 'href', 'class'])

  return (
    <A
      class={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ease-in-out outline-none',
        'text-sm font-medium',
        active()
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
          : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        'focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600',
        local.class
      )}
      end
      href={local.href}
      {...others}
    >
      {/* Fixed-width icon container: prevents jitter as the label shows/hides */}
      <span
        class={cn(
          'flex items-center justify-center text-lg transition-colors',
          active()
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200'
        )}
      >
        {local.icon}
      </span>

      <span class="hidden whitespace-nowrap opacity-0 transition-opacity duration-300 md:block md:opacity-100">
        {local.label}
      </span>
    </A>
  )
}

const Sidebar = (props: { children: JSX.Element; class?: string }) => {
  return (
    <aside
      class={cn(
        'flex flex-col h-full py-4 px-3 space-y-2 overflow-y-auto',
        'scrollbar-hide',
        'bg-slate-50 border-r border-slate-200',
        'dark:bg-slate-900 dark:border-slate-800',
        'transition-[width,background-color,border-color] duration-300 ease-in-out',
        'drag-none',
        props.class
      )}
    >
      {props.children}
    </aside>
  )
}

export { Sidebar, SidebarItem }

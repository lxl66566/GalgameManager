import type { JSX } from 'solid-js'

const SidebarItem = (props: { label: string; icon: JSX.Element; href: string }) => {
  return (
    <a
      href={props.href}
      class="flex items-center px-4 py-2 hover:dark:bg-gray-700 rounded-md transition-colors"
    >
      <span class="icons">{props.icon}</span>
      <span class="ml-2 hidden md:block transition-opacity duration-300 opacity-0 md:opacity-100">
        {props.label}
      </span>
    </a>
  )
}

const Sidebar = (props: { children: JSX.ArrayElement }) => {
  return (
    <div class="flex flex-col dark:bg-slate-900 text-slate-400 p-4 space-y-4 overflow-y-auto scrollbar-hide">
      {props.children}
    </div>
  )
}

export { SidebarItem, Sidebar }

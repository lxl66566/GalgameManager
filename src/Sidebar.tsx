import { JSX } from 'solid-js'

const SidebarItem = (props: { label: string; icon: JSX.Element; href: string }) => {
  return (
    <a
      href={props.href}
      class="flex items-center px-4 py-2 hover:bg-gray-700 rounded-md transition-colors"
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
    <div class="flex flex-col bg-gray-800 text-white p-4 space-y-4 overflow-y-auto">
      {props.children}
    </div>
  )
}

export { SidebarItem, Sidebar }

// src/components/Tabs.tsx
import { clsx } from 'clsx'
import { For, type JSX } from 'solid-js'

export interface TabItem<T extends string> {
  key: T
  label: string
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (key: T) => void
  class?: string
}

export function Tabs<T extends string>(props: TabsProps<T>): JSX.Element {
  return (
    <div
      class={clsx(
        'w-full border-b border-gray-200 dark:border-gray-800 mt-0',
        props.class
      )}
    >
      {/* 
        justify-center: 居中所有 tab
        -mb-px: 让 active border 盖住底部分割线
      */}
      <nav
        class="-mb-px flex justify-center space-x-8 overflow-x-auto no-scrollbar"
        aria-label="Tabs"
      >
        <For each={props.items}>
          {item => {
            const isActive = () => props.value === item.key
            return (
              <button
                onClick={() => props.onChange(item.key)}
                class={clsx(
                  'whitespace-nowrap border-b-2 pb-2 pt-3 px-1 text-sm font-medium transition-colors duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 rounded-t-sm cursor-pointer',
                  isActive()
                    ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:text-gray-200'
                )}
                aria-current={isActive() ? 'page' : undefined}
              >
                {item.label}
              </button>
            )
          }}
        </For>
      </nav>
    </div>
  )
}

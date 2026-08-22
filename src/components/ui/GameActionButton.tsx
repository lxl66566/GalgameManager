import { Show, type JSX } from 'solid-js'

interface GameActionButtonProps {
  colorClass: string
  disabled?: boolean // 新增
  icon: JSX.Element
  loading?: boolean // 新增
  onClick: () => void
  title: string
}

export const GameActionButton = (props: GameActionButtonProps) => {
  return (
    <button
      aria-label={props.title}
      class={`flex items-center justify-center rounded-full p-2 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none ${
        props.loading || props.disabled
          ? 'cursor-not-allowed bg-gray-200 opacity-50 dark:bg-gray-700'
          : `${props.colorClass} hover:bg-opacity-10 dark:hover:bg-opacity-20 cursor-pointer hover:scale-110 hover:bg-gray-500 active:scale-95`
      } `}
      disabled={
        // Intentional boolean OR: `??` would skip `loading` when `disabled`
        // is explicitly `false`, leaving the button enabled while loading.
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        props.disabled || props.loading
      }
      onClick={e => {
        e.stopPropagation()
        if (!props.disabled && !props.loading) {
          props.onClick()
        }
      }}
      title={props.title}
    >
      <Show fallback={props.icon} when={props.loading}>
        {/* 加载动画 Spinner */}
        <svg
          class="h-5 w-5 animate-spin text-current"
          fill="none"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            fill="currentColor"
          />
        </svg>
      </Show>
    </button>
  )
}

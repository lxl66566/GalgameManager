import { Show, type JSX } from 'solid-js'

interface GameActionButtonProps {
  icon: JSX.Element
  colorClass: string
  onClick: () => void
  title: string
  loading?: boolean // 新增
  disabled?: boolean // 新增
}

export const GameActionButton = (props: GameActionButtonProps) => {
  return (
    <button
      title={props.title}
      disabled={props.disabled || props.loading}
      onClick={e => {
        e.stopPropagation()
        if (!props.disabled && !props.loading) {
          props.onClick()
        }
      }}
      class={`
        p-2 rounded-full transition-all duration-200 
        flex items-center justify-center
        ${
          props.loading || props.disabled
            ? 'opacity-50 cursor-not-allowed bg-gray-200 dark:bg-gray-700'
            : `${props.colorClass} hover:scale-110 active:scale-95 hover:bg-opacity-10 dark:hover:bg-opacity-20 hover:bg-gray-500 cursor-pointer`
        }
      `}
    >
      <Show when={props.loading} fallback={props.icon}>
        {/* 加载动画 Spinner */}
        <svg
          class="animate-spin h-5 w-5 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </Show>
    </button>
  )
}

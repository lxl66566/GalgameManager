import { Show, type JSX } from 'solid-js'
import { Spinner } from './Spinner'

interface GameActionButtonProps {
  icon: JSX.Element
  colorClass: string
  onClick: () => void
  title: string
  loading?: boolean
  disabled?: boolean
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
        <Spinner size="sm" />
      </Show>
    </button>
  )
}

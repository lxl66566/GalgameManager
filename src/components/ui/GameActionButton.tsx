import { type JSX } from 'solid-js'

export const GameActionButton = (props: {
  icon: JSX.Element
  colorClass: string
  onClick: () => void
  title: string
}) => {
  return (
    <button
      title={props.title}
      onClick={e => {
        e.stopPropagation()
        props.onClick()
      }}
      class={`p-2 rounded-full transition-all duration-200 hover:scale-110 active:scale-95 ${props.colorClass} hover:bg-opacity-10 dark:hover:bg-opacity-20 hover:bg-gray-500 cursor-pointer`}
    >
      {props.icon}
    </button>
  )
}

import { cn } from '~/lib/utils'
import type { JSX } from 'solid-js'

export const GameItemWrapper = ({
  children,
  extra_class
}: {
  children: JSX.Element
  extra_class?: string
}) => {
  return (
    <div
      class={cn(
        'relative rounded-xl overflow-hidden bg-white dark:bg-slate-700 shadow-lg hover:shadow-xl transition-shadow duration-300 w-44 h-72 flex flex-col',
        extra_class
      )}
    >
      {children}
    </div>
  )
}

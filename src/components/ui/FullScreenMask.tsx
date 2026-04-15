/**
 * FullScreenMask — A full-screen overlay (z-index = 20) with optional children.
 *
 * Usage:
 * ```tsx
 * <Show when={mask()}>
 *   <FullScreenMask onClose={close}>
 *     <MyModal />
 *   </FullScreenMask>
 * </Show>
 * ```
 */
import { cn } from '~/lib/utils'
import type { JSX } from 'solid-js'

interface FullScreenMaskProps {
  onClose?: () => void
  children?: JSX.Element
  class?: string
}

export default (props: FullScreenMaskProps) => {
  return (
    <div
      class={cn(
        'fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-20 p-4',
        props.class
      )}
      onClick={props.onClose}
    >
      <div onClick={e => e.stopPropagation()}>{props.children}</div>
    </div>
  )
}

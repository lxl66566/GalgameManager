/**
 * Full-screen dark overlay. z-index = 20.
 * Usage:
 * <Show when={mask()}>
 *   <FullScreenMask />
 * </Show>
 *
 * children are rendered centered on the overlay; an onClose callback fires
 * when the overlay itself is clicked.
 */

import type { JSX } from 'solid-js'

interface FullScreenMaskProps {
  children?: JSX.Element
  onClose?: () => void
}

export default (props: FullScreenMaskProps) => {
  return (
    <div
      class="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => props.onClose?.()}
    >
      <div
        onClick={e => {
          e.stopPropagation()
        }}
      >
        {props.children}
      </div>
    </div>
  )
}

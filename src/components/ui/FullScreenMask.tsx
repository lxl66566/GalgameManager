/**
 * Full-screen dark overlay. z-index = 20.
 * Usage:
 * <Show when={mask()}>
 *   <FullScreenMask />
 * </Show>
 *
 * children are rendered centered on the overlay; an onClose callback fires
 * when the overlay itself is clicked.
 *
 * Built on the kobalte Dialog primitive (modal by default): Esc closes,
 * focus is trapped inside the content, and `role="dialog"` / `aria-modal`
 * are set automatically. Set `dismissable={false}` for transient overlays
 * that must not grab focus or dialog semantics (e.g. the drag-drop hint).
 */

import { Dialog } from '@kobalte/core/dialog'
import type { JSX } from 'solid-js'
import { onCleanup, onMount, Show } from 'solid-js'

import { cn } from '~/lib/utils'

interface FullScreenMaskProps {
  children?: JSX.Element
  /** Override the dark backdrop element classes. */
  class?: string
  /** Override the centered content wrapper classes. */
  contentClass?: string
  /** When false, render a plain overlay without dialog semantics (no Esc
   *  handling, no focus trap) — e.g. the transient drag-drop hint. */
  dismissable?: boolean
  onClose?: () => void
}

export default (props: FullScreenMaskProps) => {
  const dismissable = () => props.dismissable !== false

  // The parent unmounts the mask via <Show> without flipping Dialog's `open`,
  // so kobalte's own focus restore never runs — restore manually on cleanup.
  let previouslyFocused: HTMLElement | null = null
  onMount(() => {
    previouslyFocused = document.activeElement as HTMLElement | null
  })
  onCleanup(() => {
    previouslyFocused?.focus()
  })

  return (
    <Show
      fallback={
        <div class="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div>{props.children}</div>
        </div>
      }
      when={dismissable()}
    >
      <Dialog
        onOpenChange={isOpen => {
          if (!isOpen) props.onClose?.()
        }}
        open
      >
        <Dialog.Portal>
          <Dialog.Overlay
            class={cn('fixed inset-0 z-20 bg-black/70 backdrop-blur-sm', props.class)}
          />
          {/* pointer-events-none lets clicks on the backdrop pass through to
              the overlay, which counts as "outside the content" and dismisses
              the dialog (matches the previous mask-click-to-close behavior). */}
          <Dialog.Content
            class={cn(
              'fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-none',
              props.contentClass
            )}
          >
            <div class="pointer-events-auto">{props.children}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </Show>
  )
}

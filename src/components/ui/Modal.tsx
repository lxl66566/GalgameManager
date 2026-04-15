/**
 * Modal — A dialog overlay built on Kobalte's Dialog primitive.
 *
 * Provides three slots: header, children (body), footer.
 * Replaces the scattered FullScreenMask + raw div pattern used across modals.
 *
 * Usage:
 * ```tsx
 * <Modal open={show()} onClose={() => setShow(false)}>
 *   <Modal.Header>Title</Modal.Header>
 *   <Modal.Body>Content...</Modal.Body>
 *   <Modal.Footer>
 *     <Button onClick={close}>Cancel</Button>
 *     <Button variant="primary" onClick={save}>Save</Button>
 *   </Modal.Footer>
 * </Modal>
 * ```
 */
import * as Dialog from '@kobalte/core/dialog'
import { cn } from '~/lib/utils'
import { Show, splitProps, type Component, type JSX } from 'solid-js'

// ─── Sub-components ──────────────────────────────────────────────────────────

export interface ModalHeaderProps {
  children: JSX.Element
  class?: string
}

/** Header slot — renders inside a bordered row at the top. */
const ModalHeader: Component<ModalHeaderProps> = props => (
  <div
    class={cn(
      'flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700',
      'bg-gray-50 dark:bg-gray-800/50 flex-shrink-0',
      props.class
    )}
  >
    {props.children}
  </div>
)

export interface ModalBodyProps {
  children: JSX.Element
  class?: string
}

/** Body slot — the main scrollable content area. */
const ModalBody: Component<ModalBodyProps> = props => (
  <div class={cn('flex-1 overflow-y-auto custom-scrollbar p-6 min-h-0', props.class)}>
    {props.children}
  </div>
)

export interface ModalFooterProps {
  children: JSX.Element
  class?: string
}

/** Footer slot — renders inside a bordered row at the bottom. */
const ModalFooter: Component<ModalFooterProps> = props => (
  <div
    class={cn(
      'flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 dark:border-gray-700',
      'bg-gray-50 dark:bg-gray-800/50 flex-shrink-0',
      props.class
    )}
  >
    {props.children}
  </div>
)

// ─── Main Modal ──────────────────────────────────────────────────────────────

export interface ModalProps {
  open: boolean
  onClose: () => void
  children: JSX.Element
  class?: string
}

const ModalRoot: Component<ModalProps> = props => {
  const [local, rest] = splitProps(props, ['open', 'onClose', 'children', 'class'])

  return (
    <Dialog.Root
      open={local.open}
      onOpenChange={open => {
        if (!open) local.onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          class={cn(
            'fixed inset-0 z-20 bg-black/70 backdrop-blur-sm',
            'animate-in fade-in duration-200'
          )}
        />
        <div class="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            class={cn(
              'pointer-events-auto flex flex-col',
              'bg-white dark:bg-zinc-800 rounded-xl shadow-2xl',
              'border border-gray-200 dark:border-gray-700',
              'w-full max-w-4xl max-h-[90vh] overflow-hidden',
              'animate-in fade-in zoom-in-95 duration-200',
              local.class
            )}
          >
            {local.children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// Compose as a compound component
export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Body: ModalBody,
  Footer: ModalFooter
})

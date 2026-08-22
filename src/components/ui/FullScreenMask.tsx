/**
 * 全屏遮罩组件，变黑。z-index = 20
 * 使用方法：
 * <Show when={mask()}>
 *   <FullScreenMask />
 * </Show>
 *
 * 还可以传入 children 元素，它会在遮罩层上居中显示；可以传入 onClose 回调函数，
 * 点击遮罩层或按下 Esc 后触发。
 *
 * 无障碍：内容容器是一个 modal dialog（role="dialog" + aria-modal），打开时
 * 焦点移入第一个可交互控件，Tab / Shift+Tab 在弹窗内循环（focus trap），
 * 关闭后焦点还原到打开前的元素。
 */

import { onCleanup, onMount, type JSX } from 'solid-js'

interface FullScreenMaskProps {
  children?: JSX.Element
  onClose?: () => void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Visible focusable elements inside the dialog (getClientRects filters out
 *  display:none / detached nodes without the offsetParent fixed-position pitfall). */
const focusableIn = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    el => el.getClientRects().length > 0
  )

export default (props: FullScreenMaskProps) => {
  let dialogRef: HTMLDivElement | undefined
  let previouslyFocused: HTMLElement | null = null

  onMount(() => {
    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Move focus into the dialog; fall back to the dialog container itself.
    const target = dialogRef ? (focusableIn(dialogRef)[0] ?? dialogRef) : undefined
    target?.focus()
  })

  onCleanup(() => {
    previouslyFocused?.focus()
    // The mask unmounts synchronously inside its own click event; Chromium
    // does not re-evaluate :hover for the elements uncovered that way, so a
    // hover-driven UI underneath (e.g. GameItem's slide-up toolbar) stays
    // stuck open. Toggling pointer-events with a forced reflow kicks the
    // hover recalculation; real hover re-applies on the next pointer move.
    const root = document.documentElement
    root.style.pointerEvents = 'none'
    void root.offsetWidth
    root.style.pointerEvents = ''
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      props.onClose?.()
      return
    }
    if (e.key !== 'Tab' || !dialogRef) return
    const focusables = focusableIn(dialogRef)
    if (focusables.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (!first || !last) {
      e.preventDefault()
      return
    }
    const active = document.activeElement
    const outside = !dialogRef.contains(active)
    if (e.shiftKey && (outside || active === first)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (outside || active === last)) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      class="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => props.onClose?.()}
    >
      <div
        aria-modal="true"
        onClick={e => {
          e.stopPropagation()
        }}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {props.children}
      </div>
    </div>
  )
}

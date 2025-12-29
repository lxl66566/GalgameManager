/**
 * 全屏遮罩组件，变黑。z-index = 20
 * 使用方法：
 * <Show when={mask()}>
 *   <FullScreenMask />
 * </Show>
 *
 * 还可以传入 children 元素，它会在遮罩层上居中显示；可以传入 onClose 回调函数，点击遮罩层后触发
 */

import type { JSX } from 'solid-js'

interface FullScreenMaskProps {
  onClose?: () => void
  children?: JSX.Element
}

export default (props: FullScreenMaskProps) => {
  return (
    <div
      class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-20 p-4"
      onClick={props.onClose}
    >
      <div onClick={e => e.stopPropagation()}>{props.children}</div>
    </div>
  )
}

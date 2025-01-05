/**
 * 全屏遮罩组件，变黑。z-index = 20
 * 使用方法：
 * <Show when={mask()}>
 *   <FullScreenMask />
 * </Show>
 *
 * 还可以传入 children 元素，它会在遮罩层上居中显示。
 */

import { JSX } from 'solid-js'

export default ({ children }: { children?: JSX.Element }) => {
  return (
    <div
      class={`fixed inset-0 flex items-center justify-center transition-opacity duration-300 bg-black/50 z-20`}
    >
      {children}
    </div>
  )
}

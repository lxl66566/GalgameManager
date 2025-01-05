/**
 * 全屏遮罩组件，变黑。z-index = 20
 * 使用方法：
 * <Show when={mask()}>
 *   <FullScreenMask />
 * </Show>
 */

export default () => {
  return (
    <div
      class={`fixed inset-0 bg-black transition-opacity duration-300 bg-black/50 z-20`}
    />
  )
}

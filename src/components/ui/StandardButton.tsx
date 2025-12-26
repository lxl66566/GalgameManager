/**
 * 按钮组件，用于游戏设置页面。
 * @param func 点击事件
 * @param color 按钮颜色的 class
 * @param text 按钮文本
 */
export default ({
  func,
  color,
  text
}: {
  func: () => void
  color: string
  text: string
}) => (
  <button
    onClick={func}
    class={`${color} dark:text-gray-800 rounded font-bold mx-2 mt-4 px-2 py-1`}
  >
    {text}
  </button>
)

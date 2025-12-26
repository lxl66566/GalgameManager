import { listen } from '@tauri-apps/api/event'
import { createSignal, Show, type JSX } from 'solid-js'
import FullScreenMask from './ui/FullScreenMask'

export function DropArea({
  children,
  callback
}: {
  /**
   * Element to display when not hovering.
   * @default <p>拖拽文件到此处</p>
   */
  children?: JSX.Element
  /**
   * Handles the drop event. If not provided, the file paths which dragged into window
   * will be displayed in the element.
   * @param paths The paths of the files dropped.
   * @returns void
   */
  callback?: (paths: string[]) => void
}) {
  const [hovering, setHovering] = createSignal(false)
  // innerText 在没有给出 children 时使用，一般用于测试
  const [innerText, setInnerText] = createSignal('拖拽文件到此处')
  void listen('tauri://drag-enter', () => {
    setHovering(true)
  })
  void listen<{ paths: string[] }>('tauri://drag-drop', event => {
    setHovering(false)
    if (callback) {
      callback(event.payload.paths)
    } else {
      setInnerText(`获取到路径：${event.payload.paths.join(', ')}`)
    }
  })
  void listen('tauri://drag-leave', () => {
    setHovering(false)
  })

  return (
    <>
      <Show when={hovering()}>
        <FullScreenMask />
      </Show>
      {children ?? <p>{innerText()}</p>}
    </>
  )
}

import { listen } from '@tauri-apps/api/event'
import { createSignal, JSX } from 'solid-js'

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
    <div
      class="flex-1 flex bg-black items-center justify-center transition-opacity duration-300"
      classList={{ 'bg-black/50': hovering(), 'bg-black/0': !hovering() }}
    >
      <div class="p-4 text-center">{children ?? <p>{innerText()}</p>}</div>
    </div>
  )
}

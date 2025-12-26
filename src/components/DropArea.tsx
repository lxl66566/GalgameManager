import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { createSignal, onCleanup, Show, type JSX } from 'solid-js'
import FullScreenMask from './ui/FullScreenMask'

interface DropAreaProps {
  /**
   * Element to display when not hovering.
   * @default <p>拖拽文件到此处</p>
   */
  children?: JSX.Element
  /**
   * Handles the drop event.
   * @param paths The paths of the files dropped.
   */
  callback?: (paths: string[]) => void
  /**
   * Extra class names for the container div.
   */
  class?: string
}

export function DropArea(props: DropAreaProps) {
  const [hovering, setHovering] = createSignal(false)
  const [innerText, setInnerText] = createSignal('拖拽文件到此处')

  // 存储取消监听的函数
  let unlisteners: UnlistenFn[] = []

  const setupListeners = async () => {
    unlisteners = await Promise.all([
      listen('tauri://drag-enter', () => {
        setHovering(true)
      }),
      listen('tauri://drag-leave', () => {
        setHovering(false)
      }),
      listen<{ paths: string[] }>('tauri://drag-drop', event => {
        setHovering(false)
        if (props.callback) {
          props.callback(event.payload.paths)
        } else {
          setInnerText(`获取到路径：${event.payload.paths.join(', ')}`)
        }
      })
    ])
  }

  // 初始化监听
  setupListeners()

  // 组件卸载时清理监听，保证 Robust
  onCleanup(() => {
    unlisteners.forEach(fn => fn())
  })

  return (
    <>
      <Show when={hovering()}>
        <FullScreenMask />
      </Show>
      {/* 使用 div 包裹并应用传入的 class */}
      <div class={props.class}>{props.children ?? <p>{innerText()}</p>}</div>
    </>
  )
}

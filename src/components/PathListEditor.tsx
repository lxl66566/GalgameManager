import { open } from '@tauri-apps/plugin-dialog'
import { useI18n } from '~/i18n'
import { createSignal, For, Show } from 'solid-js'

interface PathListEditorProps {
  paths: string[]
  onChange: (newPaths: string[]) => void
  label?: string
}

export default function PathListEditor(props: PathListEditorProps) {
  const { t } = useI18n()
  // 记录当前正在编辑的索引，null 表示没有在编辑
  const [editingIndex, setEditingIndex] = createSignal<number | null>(null)

  const handleAddPath = async (directory: boolean) => {
    try {
      const selected = await open({
        directory,
        multiple: true,
        title: t('hint.selectSaveArchive')
      })

      if (selected) {
        const newPaths = Array.isArray(selected) ? selected : [selected]
        // 过滤重复路径
        const uniquePaths = newPaths.filter(p => !props.paths.includes(p))
        if (uniquePaths.length > 0) {
          props.onChange([...props.paths, ...uniquePaths])
        }
      }
    } catch (err) {
      console.error('Failed to open dialog:', err)
    }
  }

  const handleRemovePath = (index: number) => {
    const newPaths = [...props.paths]
    newPaths.splice(index, 1)
    props.onChange(newPaths)
    // 如果删除的是当前正在编辑的项，重置编辑状态
    if (editingIndex() === index) {
      setEditingIndex(null)
    }
  }

  const handleUpdatePath = (index: number, newValue: string) => {
    if (!newValue.trim()) {
      setEditingIndex(null)
      return
    }

    const newPaths = [...props.paths]
    newPaths[index] = newValue
    props.onChange(newPaths)
    setEditingIndex(null)
  }

  return (
    <div class="flex flex-col gap-2 w-full">
      {/* Header */}
      <div class="flex justify-between items-center">
        <span class="text-sm font-bold text-gray-300">{props.label || 'Save Path'}</span>
        <div class="flex gap-2">
          <button
            onClick={() => handleAddPath(false)}
            class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors cursor-pointer"
            type="button"
          >
            + {t('ui.addFile')}
          </button>
          <button
            onClick={() => handleAddPath(true)}
            class="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors cursor-pointer"
            type="button"
          >
            + {t('ui.addFolder')}
          </button>
        </div>
      </div>

      {/* List Container */}
      {/* 使用 flex flex-col 确保内部内容可以撑开并居中 */}
      <div class="bg-gray-800 rounded border border-gray-600 p-2 min-h-[80px] max-h-[150px] overflow-y-auto flex flex-col">
        <Show
          when={props.paths.length > 0}
          fallback={
            // 改进 1: 使用 flex-1 items-center justify-center 实现垂直水平居中
            <div class="flex-1 flex items-center justify-center text-gray-500 text-xs select-none">
              {t('hint.noPathPleaseAdd')}
            </div>
          }
        >
          <ul class="flex flex-col gap-1 w-full">
            <For each={props.paths}>
              {(path, i) => (
                <li class="flex items-center justify-between bg-gray-700 px-2 py-1 rounded text-xs group min-h-[28px]">
                  <Show
                    when={editingIndex() === i()}
                    fallback={
                      // 显示模式：双击进入编辑
                      <span
                        class="truncate text-gray-300 mr-2 flex-1 cursor-text select-text hover:text-white transition-colors"
                        title={t('hint.doubleClickToEdit')}
                        onDblClick={() => setEditingIndex(i())}
                      >
                        {path}
                      </span>
                    }
                  >
                    {/* 编辑模式 */}
                    <input
                      type="text"
                      value={path}
                      class="flex-1 bg-gray-900 text-white px-1 rounded border border-blue-500 outline-none mr-2 min-w-0"
                      // 自动聚焦
                      ref={el => setTimeout(() => el.focus(), 0)}
                      onBlur={e => handleUpdatePath(i(), e.currentTarget.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          handleUpdatePath(i(), e.currentTarget.value)
                        } else if (e.key === 'Escape') {
                          setEditingIndex(null) // 取消编辑
                        }
                      }}
                    />
                  </Show>

                  {/* 只有在非编辑模式下才显示删除按钮，或者保持显示均可，这里保持显示 */}
                  <button
                    onClick={() => handleRemovePath(i())}
                    class="text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity px-1"
                    title={t('ui.delete')}
                    tabIndex={-1} // 防止 Tab 键误触
                  >
                    ✕
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>

      {/* 底部提示 (可选) */}
      <Show when={props.paths.length > 0}>
        <div class="text-[10px] text-gray-500 text-right px-1">
          {t('hint.doubleClickToEdit')}
        </div>
      </Show>
    </div>
  )
}

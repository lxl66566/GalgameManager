import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { open } from '@tauri-apps/plugin-dialog'
import { fuckBackslash } from '@utils/path'
import { useI18n } from '~/i18n'
import { cn } from '~/lib/utils'
import { createSignal, For, Show } from 'solid-js'

interface PathListEditorProps {
  paths: string[]
  onChange: (newPaths: string[]) => void
  /**
   * Transform function applied when a path comes from a "bulk" source
   * (file-dialog selection or clipboard paste).
   */
  onBulkInput?: (value: string) => string
  label?: string
}

export default function PathListEditor(props: PathListEditorProps) {
  const { t } = useI18n()
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
        const transformed = newPaths.map(p => {
          let val = fuckBackslash(p)
          if (props.onBulkInput) {
            val = props.onBulkInput(val)
          }
          return val
        })
        const uniquePaths = transformed.filter(p => !props.paths.includes(p))
        if (uniquePaths.length > 0) {
          props.onChange([...props.paths, ...uniquePaths])
        }
      }
    } catch (err) {
      console.error(`Failed to open dialog: ${err}`)
    }
  }

  const handleRemovePath = (index: number) => {
    const newPaths = [...props.paths]
    newPaths.splice(index, 1)
    props.onChange(newPaths)
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
        <span class="text-sm font-bold text-gray-700 dark:text-gray-300">
          {props.label || 'Save Path'}
        </span>
        <div class="flex gap-2">
          <Button variant="primary" size="xs" onClick={() => handleAddPath(false)}>
            + {t('ui.addFile')}
          </Button>
          <Button variant="primary" size="xs" onClick={() => handleAddPath(true)}>
            + {t('ui.addFolder')}
          </Button>
        </div>
      </div>

      {/* List Container */}
      <div class="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 p-2 min-h-[80px] max-h-[150px] overflow-y-auto flex flex-col transition-colors">
        <Show
          when={props.paths.length > 0}
          fallback={
            <div class="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs select-none">
              {t('hint.noPathPleaseAdd')}
            </div>
          }
        >
          <ul class="flex flex-col gap-1 w-full">
            <For each={props.paths}>
              {(path, i) => (
                <li class="flex items-center justify-between bg-white dark:bg-gray-700 border border-gray-200 dark:border-transparent px-2 py-1 rounded text-xs group min-h-[28px] transition-colors">
                  <Show
                    when={editingIndex() === i()}
                    fallback={
                      <span
                        class="truncate text-gray-600 dark:text-gray-300 mr-2 flex-1 cursor-text select-text hover:text-gray-900 dark:hover:text-white transition-colors"
                        title={t('hint.doubleClickToEdit')}
                        onDblClick={() => setEditingIndex(i())}
                      >
                        {path}
                      </span>
                    }
                  >
                    <input
                      type="text"
                      value={path}
                      class={cn(
                        'flex-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
                        'rounded border border-blue-500 outline-none mr-2 min-w-0',
                        'px-1'
                      )}
                      ref={el => setTimeout(() => el.focus(), 0)}
                      onInput={e => {
                        if (e.inputType === 'insertFromPaste') {
                          const input = e.currentTarget
                          let val = fuckBackslash(input.value)
                          if (props.onBulkInput) {
                            val = props.onBulkInput(val)
                          }
                          input.value = val
                        }
                      }}
                      onBlur={e => handleUpdatePath(i(), e.currentTarget.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')
                          handleUpdatePath(i(), e.currentTarget.value)
                        else if (e.key === 'Escape') setEditingIndex(null)
                      }}
                    />
                  </Show>

                  <button
                    onClick={() => handleRemovePath(i())}
                    class="text-gray-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity px-1"
                    title={t('ui.delete')}
                    tabIndex={-1}
                  >
                    ✕
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>

      {/* Bottom hint */}
      <Show when={props.paths.length > 0}>
        <div class="text-[10px] text-gray-400 dark:text-gray-500 text-right px-1">
          {t('hint.doubleClickToEdit')}
        </div>
      </Show>
    </div>
  )
}

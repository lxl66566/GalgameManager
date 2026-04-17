import { FieldHint } from '@components/ui/FieldHint'
import { GameEditLabel } from '@components/ui/GameEditLabel'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { fuckBackslash } from '@utils/path'
import { extractUnknownVars, resolveVar } from '@utils/resolveVar'
import { useVarMap } from '@utils/useVarMap'
import { useI18n } from '~/i18n'
import { FiFilePlus, FiFolderPlus } from 'solid-icons/fi'
import {
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
  type Component
} from 'solid-js'

interface PathListEditorProps {
  paths: string[]
  onChange: (newPaths: string[]) => void
  /**
   * Transform function applied when a path comes from a "bulk" source
   * (file-dialog selection or clipboard paste).
   * Receives the normalised value (backslashes already replaced) and
   * must return the transformed string.
   */
  onBulkInput?: (value: string) => string
  label?: string
  labelClass?: string
  /**
   * Enable validation of `{var}` placeholders against the current device's
   * variable map. When enabled, unknown variable names in any path trigger
   * a consolidated warning hint below the list.
   *
   * @default false
   */
  checkVars?: boolean
  /**
   * Enable asynchronous path-existence validation. When enabled, each
   * resolved path (after variable substitution) is checked against the
   * local filesystem via `paths_exist`. A warning is shown if any paths
   * do not exist.
   *
   * @default false
   */
  checkPathExist?: boolean
}

interface ActionButtonProps {
  icon: Component<any>
  label: string
  onClick: () => void
}

// 抽离的带展开动画的按钮组件
function ActionButton(props: ActionButtonProps) {
  const Icon = props.icon
  return (
    <button
      onClick={props.onClick}
      class="group flex items-center rounded p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-all cursor-pointer"
      title={props.label}
      type="button"
    >
      <Icon class="w-4 h-4 shrink-0" />
      {/* 利用 grid-template-columns 实现平滑的宽度展开动画 */}
      <div class="grid grid-cols-[0fr] group-hover:grid-cols-[1fr] transition-[grid-template-columns] duration-300 ease-in-out">
        <span class="overflow-hidden whitespace-nowrap text-xs font-medium pl-0 group-hover:pl-1.5 transition-all duration-300">
          {props.label}
        </span>
      </div>
    </button>
  )
}

export default function PathListEditor(props: PathListEditorProps) {
  const { t } = useI18n()
  const varMap = useVarMap()
  // 记录当前正在编辑的索引，null 表示没有在编辑
  const [editingIndex, setEditingIndex] = createSignal<number | null>(null)

  // ─── Validations ──────────────────────────────────────────────────────────

  /** Check if any save path contains unknown variable references. */
  const varWarning = createMemo(() => {
    if (!props.checkVars) return undefined
    const vm = varMap()
    if (!vm) return undefined
    const allUnknown = new Set<string>()
    for (const p of props.paths) {
      for (const u of extractUnknownVars(p, vm)) {
        allUnknown.add(u)
      }
    }
    return allUnknown.size > 0
      ? t('hint.unknownVar') + [...allUnknown].join(', ')
      : undefined
  })

  /** Check if any resolved path does not exist on disk. */
  const [pathExistWarning] = createResource(
    () => ({
      paths: [...props.paths],
      vars: varMap(),
      enabled: props.checkPathExist === true
    }),
    async ({ paths, vars, enabled }) => {
      if (!enabled || paths.length === 0 || !vars) return undefined
      try {
        const resolved = paths.map(p => resolveVar(p, vars))
        const results = await invoke<boolean[]>('paths_exist', { paths: resolved })
        const missing = paths.filter((_, i) => !results[i])
        return missing.length > 0 ? t('hint.partialPathNotExist') : undefined
      } catch {
        return undefined
      }
    }
  )

  // ─── Path helpers ─────────────────────────────────────────────────────────

  // 路径标准化逻辑
  const normalizePath = (p: string) => {
    let val = fuckBackslash(p)
    if (props.onBulkInput) {
      val = props.onBulkInput(val)
    }
    return val
  }

  const handleAddPath = async (directory: boolean) => {
    try {
      const selected = await open({
        directory,
        multiple: true,
        title: t('hint.selectSaveArchive')
      })

      if (selected) {
        const newPaths = Array.isArray(selected) ? selected : [selected]
        const uniquePaths = newPaths
          .map(normalizePath)
          .filter(p => !props.paths.includes(p))

        if (uniquePaths.length > 0) {
          props.onChange([...props.paths, ...uniquePaths])
        }
      }
    } catch (err) {
      console.error(`Failed to open dialog: ${err}`)
    }
  }

  const handleRemovePath = (index: number) => {
    props.onChange(props.paths.filter((_, i) => i !== index))
    // 如果删除的是当前正在编辑的项，重置编辑状态
    if (editingIndex() === index) {
      setEditingIndex(null)
    }
  }

  const handleUpdatePath = (index: number, newValue: string) => {
    const trimmed = newValue.trim()
    // 如果为空或值未改变，则不触发 onChange
    if (!trimmed || props.paths[index] === trimmed) {
      setEditingIndex(null)
      return
    }

    const newPaths = [...props.paths]
    newPaths[index] = trimmed
    props.onChange(newPaths)
    setEditingIndex(null)
  }

  return (
    <div class="flex flex-col gap-2 w-full">
      {/* Header */}
      <div class="flex justify-between items-center">
        <GameEditLabel class={props.labelClass} children={props.label} />
        <div class="flex gap-1">
          <ActionButton
            icon={FiFilePlus}
            label={t('ui.addFile')}
            onClick={() => handleAddPath(false)}
          />
          <ActionButton
            icon={FiFolderPlus}
            label={t('ui.addFolder')}
            onClick={() => handleAddPath(true)}
          />
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
                      // 显示模式
                      <span
                        class="truncate text-gray-600 dark:text-gray-300 mr-2 flex-1 cursor-text select-text hover:text-gray-900 dark:hover:text-white transition-colors"
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
                      class="flex-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-1 rounded border border-blue-500 outline-none mr-2 min-w-0"
                      ref={el => setTimeout(() => el.focus(), 0)}
                      onInput={e => {
                        // Detect paste in edit mode — normalise backslashes + onBulkInput
                        if (e.inputType === 'insertFromPaste') {
                          e.currentTarget.value = normalizePath(e.currentTarget.value)
                        }
                      }}
                      onBlur={e => handleUpdatePath(i(), e.currentTarget.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          handleUpdatePath(i(), e.currentTarget.value)
                        } else if (e.key === 'Escape') {
                          setEditingIndex(null)
                        }
                      }}
                    />
                  </Show>

                  <button
                    onClick={() => handleRemovePath(i())}
                    class="text-gray-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity px-1 cursor-pointer"
                    title={t('ui.delete')}
                    tabIndex={-1}
                    type="button"
                  >
                    ✕
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>

      {/* 构建一个高度为 0 的锚点，让 warning 相对于这里进行绝对定位 */}
      <div class="relative w-full h-0">
        <div class="absolute top-0 left-0 flex flex-col gap-2 w-full z-10">
          <Show when={varWarning()}>
            <FieldHint variant="warning" text={varWarning()} />
          </Show>
          <Show when={pathExistWarning()}>
            <FieldHint variant="warning" text={pathExistWarning()} />
          </Show>
        </div>
      </div>

      {/* 正常文档流中的提示，永远紧贴主体 */}
      <Show when={props.paths.length > 0}>
        <div class="text-[10px] text-gray-400 dark:text-gray-500 text-right pr-1 top-0">
          {t('hint.doubleClickToEdit')}
        </div>
      </Show>
    </div>
  )
}

import { FieldHint } from '@components/ui/FieldHint'
import { GameEditLabel } from '@components/ui/GameEditLabel'
import HoverExpandButton from '@components/ui/HoverExpandButton'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { nextEditingIndex } from '@utils/editingIndex'
import { errToStr } from '@utils/log'
import { fuckBackslash } from '@utils/path'
import { resolveVar } from '@utils/resolveVar'
import { useVarMap } from '@utils/useVarMap'
import { useVarWarning } from '@utils/useVarWarning'
import { FiFilePlus, FiFolderPlus } from 'solid-icons/fi'
import { createMemo, createResource, createSignal, For, Show } from 'solid-js'

import { useI18n } from '~/i18n'

interface PathListEditorProps {
  /**
   * Enable asynchronous path-existence validation. When enabled, each
   * resolved path (after variable substitution) is checked against the
   * local filesystem via `paths_exist`. A warning is shown if any paths
   * do not exist.
   *
   * @default false
   */
  checkPathExist?: boolean
  /**
   * Enable validation of `{var}` placeholders against the current device's
   * variable map. When enabled, unknown variable names in any path trigger
   * a consolidated warning hint below the list.
   *
   * @default false
   */
  checkVars?: boolean
  label?: string
  labelClass?: string
  /**
   * Transform function applied when a path comes from a "bulk" source
   * (file-dialog selection or clipboard paste).
   * Receives the normalised value (backslashes already replaced) and
   * must return the transformed string.
   */
  onBulkInput?: (value: string) => string
  onChange: (newPaths: string[]) => void
  paths: string[]
}

export default function PathListEditor(props: PathListEditorProps) {
  const { t } = useI18n()
  const variableMap = useVarMap()
  const [editingIndex, setEditingIndex] = createSignal<null | number>(null)

  // ─── Validations ──────────────────────────────────────────────────────────

  /** Check if any save path contains unknown variable references. */
  const variableWarning = useVarWarning(
    () => props.paths,
    () => !!props.checkVars
  )

  /** Check if any resolved path does not exist on disk. */
  const [anyPathMissing] = createResource(
    () => ({
      enabled: props.checkPathExist === true,
      paths: [...props.paths],
      vars: variableMap()
    }),
    async ({ enabled, paths, vars }) => {
      if (!enabled || paths.length === 0 || !vars) return false
      try {
        const resolved = paths.map(p => resolveVar(p, vars))
        const results = await invoke<boolean[]>('paths_exist', { paths: resolved })
        return results.some(exists => !exists)
      } catch {
        return false
      }
    }
  )
  // Derive the message in a memo so a locale switch re-translates it without
  // re-invoking the IPC (calling `t` inside the fetcher is not tracked).
  const pathExistWarning = createMemo(() =>
    anyPathMissing() ? t('hint.partialPathNotExist') : undefined
  )

  // ─── Path helpers ─────────────────────────────────────────────────────────

  const normalizePath = (p: string) => {
    let value = fuckBackslash(p)
    if (props.onBulkInput) {
      value = props.onBulkInput(value)
    }
    return value
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
    } catch (error) {
      console.error(`Failed to open dialog: ${errToStr(error)}`)
    }
  }

  const handleRemovePath = (index: number) => {
    props.onChange(props.paths.filter((_, index_) => index_ !== index))
    setEditingIndex(nextEditingIndex(editingIndex(), index))
  }

  const handleUpdatePath = (index: number, newValue: string) => {
    const trimmed = newValue.trim()
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
    <div class="flex w-full flex-col gap-2">
      {/* Header */}
      <div class="flex items-center justify-between">
        <GameEditLabel children={props.label} class={props.labelClass} />
        <div class="flex gap-1">
          <HoverExpandButton
            icon={FiFilePlus}
            label={t('ui.addFile')}
            onClick={() => handleAddPath(false)}
          />
          <HoverExpandButton
            icon={FiFolderPlus}
            label={t('ui.addFolder')}
            onClick={() => handleAddPath(true)}
          />
        </div>
      </div>

      {/* List Container */}
      <div class="flex max-h-[150px] min-h-[80px] flex-col overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2 transition-colors dark:border-gray-600 dark:bg-gray-800">
        <Show
          fallback={
            <div class="flex flex-1 items-center justify-center text-xs text-gray-400 select-none dark:text-gray-500">
              {t('hint.noPathPleaseAdd')}
            </div>
          }
          when={props.paths.length > 0}
        >
          <ul class="flex w-full flex-col gap-1">
            <For each={props.paths}>
              {(path, index) => (
                <li class="group flex min-h-[28px] items-center justify-between rounded border border-gray-200 bg-white px-2 py-1 text-xs transition-colors dark:border-transparent dark:bg-gray-700">
                  <Show
                    fallback={
                      <span
                        class="mr-2 flex-1 cursor-text truncate text-gray-600 transition-colors select-text hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                        onDblClick={() => setEditingIndex(index())}
                        title={t('hint.doubleClickToEdit')}
                      >
                        {path}
                      </span>
                    }
                    when={editingIndex() === index()}
                  >
                    <input
                      class="mr-2 min-w-0 flex-1 rounded border border-blue-500 bg-white px-1 text-gray-900 outline-none dark:bg-gray-900 dark:text-white"
                      onBlur={e => {
                        handleUpdatePath(index(), e.currentTarget.value)
                      }}
                      onInput={e => {
                        // Detect paste in edit mode — normalise backslashes + onBulkInput
                        if (e.inputType === 'insertFromPaste') {
                          e.currentTarget.value = normalizePath(e.currentTarget.value)
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          handleUpdatePath(index(), e.currentTarget.value)
                        } else if (e.key === 'Escape') {
                          setEditingIndex(null)
                        }
                      }}
                      ref={element =>
                        setTimeout(() => {
                          element.focus()
                        }, 0)
                      }
                      type="text"
                      value={path}
                    />
                  </Show>

                  <button
                    aria-label={t('ui.delete')}
                    class="cursor-pointer px-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 focus-visible:opacity-100 dark:hover:text-red-400"
                    onClick={() => {
                      handleRemovePath(index())
                    }}
                    title={t('ui.delete')}
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

      {/* Zero-height anchor so warnings can be absolutely positioned here */}
      <div class="relative h-0 w-full">
        <div class="absolute top-0 left-0 z-10 flex w-full flex-col gap-2">
          <Show when={variableWarning()}>
            <FieldHint text={variableWarning()} variant="warning" />
          </Show>
          <Show when={pathExistWarning()}>
            <FieldHint text={pathExistWarning()} variant="warning" />
          </Show>
        </div>
      </div>

      {/* In-flow hint, always attached below the list */}
      <Show when={props.paths.length > 0}>
        <div class="top-0 pr-1 text-right text-[10px] text-gray-400 dark:text-gray-500">
          {t('hint.doubleClickToEdit')}
        </div>
      </Show>
    </div>
  )
}

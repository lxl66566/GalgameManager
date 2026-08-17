import { FiPlusCircle } from 'solid-icons/fi'
import { createSignal, For, Show, type Component } from 'solid-js'
import toast from 'solid-toast'

import { useI18n } from '~/i18n'
import { cn } from '~/lib/utils'

// 核心：自动调整 Textarea 高度的辅助函数
const autoResize = (element: HTMLTextAreaElement) => {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

export interface FormTableEditorProps {
  addLabel?: string
  class?: string
  description?: string
  emptyText?: string
  label?: string
  labelClass?: string
  onCommit: (values: Record<string, string>) => void
  /**
   * Fixed set of allowed values. When provided, the value cell renders as
   * a `<select>` rather than a free-form `<textarea>`, useful for enum
   * types such as Wine DLL overrides. The first option is used as the
   * default for newly added rows.
   */
  valueOptions?: readonly FormTableEditorValueOption[]
  /** Placeholder for the value input when `valueOptions` is not provided. */
  valuePlaceholder?: string
  values: Record<string, string>
}

export interface FormTableEditorValueOption {
  label: string
  value: string
}

/**
 * Inline key-value pair editor.
 *
 * Values are free-form strings by default. Pass `valueOptions` to
 * constrain values to a fixed enum (rendered as a dropdown).
 */
export const FormTableEditor: Component<FormTableEditorProps> = props => {
  const { t } = useI18n()
  const [isAdding, setIsAdding] = createSignal(false)
  const [newKey, setNewKey] = createSignal('')
  const [newValue, setNewValue] = createSignal('')
  const [error, setError] = createSignal<null | string>(null)

  const sortedKeys = () => Object.keys(props.values).sort((a, b) => a.localeCompare(b))

  const defaultValue = () => props.valueOptions?.[0]?.value ?? ''

  const handleConfirmAdd = () => {
    const key = newKey().trim()
    if (!key) {
      setError('Key cannot be empty')
      return
    }
    if (Object.prototype.hasOwnProperty.call(props.values, key)) {
      setError('Key already exists')
      return
    }
    // For enum-valued editors, don't trim (values are precise identifiers).
    const value = props.valueOptions ? newValue() : newValue().trim()
    props.onCommit({ ...props.values, [key]: value })
    setNewKey('')
    setNewValue('')
    setError(null)
    setIsAdding(false)
  }

  const handleCancelAdd = () => {
    setIsAdding(false)
    setNewKey('')
    setNewValue('')
    setError(null)
  }

  const handleKeyBlur = (oldKey: string, inputKey: string) => {
    const trimmedNewKey = inputKey.trim()
    if (trimmedNewKey === oldKey || !trimmedNewKey) return
    if (Object.prototype.hasOwnProperty.call(props.values, trimmedNewKey)) {
      toast.error(t('settings.device.variableAlreadyExists') + trimmedNewKey)
      return
    }
    const entries = Object.entries(props.values)
    const updated: Record<string, string> = {}
    for (const [k, v] of entries) {
      updated[k === oldKey ? trimmedNewKey : k] = v
    }
    props.onCommit(updated)
  }

  const hasHeader = () => Boolean(props.label ?? props.addLabel)

  return (
    <div class={cn('flex flex-col gap-2 w-full', props.class)}>
      <Show when={hasHeader()}>
        <div class="flex items-center">
          <Show when={props.label}>
            <div class="flex flex-col">
              <span
                class={cn('text-sm text-gray-700 dark:text-gray-300', props.labelClass)}
              >
                {props.label}
              </span>
              <Show when={props.description}>
                <span class="text-[10px] text-gray-500 dark:text-gray-400">
                  {props.description}
                </span>
              </Show>
            </div>
          </Show>
          <button
            class="ml-auto flex cursor-pointer items-center gap-1 text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:text-gray-300 dark:hover:text-gray-300 dark:disabled:text-gray-600"
            disabled={isAdding()}
            onClick={() => {
              setIsAdding(true)
              setError(null)
            }}
            title={props.addLabel ?? ''}
            type="button"
          >
            <FiPlusCircle class="h-4 w-4" />
            <span class="text-xs">{props.addLabel ?? ''}</span>
          </button>
        </div>
      </Show>

      <Show when={!hasHeader()}>
        <div class="flex justify-end">
          <button
            class="flex cursor-pointer items-center gap-1 text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:text-gray-300 dark:hover:text-gray-300 dark:disabled:text-gray-600"
            disabled={isAdding()}
            onClick={() => {
              setIsAdding(true)
              setError(null)
            }}
            title={props.addLabel ?? ''}
            type="button"
          >
            <FiPlusCircle class="h-4 w-4" />
            <span class="text-xs">{props.addLabel ?? ''}</span>
          </button>
        </div>
      </Show>

      <div
        class={cn(
          'rounded border border-gray-200 dark:border-gray-600 p-1.5 min-h-[50px] overflow-y-auto flex flex-col gap-1 transition-colors',
          hasHeader()
            ? 'bg-gray-50 dark:bg-gray-800 max-h-[300px]'
            : 'bg-gray-50 dark:bg-gray-800/80 max-h-[180px]'
        )}
      >
        {/* Add new row */}
        <Show when={isAdding()}>
          {/* 将 items-center 改为 items-start，确保 textarea 变高时，其他元素依然顶部对齐 */}
          <div class="mb-0.5 flex items-start gap-1 rounded border border-blue-500/30 bg-white p-1 shadow-sm dark:bg-gray-900/50 dark:shadow-none">
            <input
              autofocus
              class="mt-[1px] w-1/3 min-w-[50px] rounded border border-gray-300 bg-gray-50 px-1 py-0.5 font-mono text-[11px] text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              onInput={e => {
                setNewKey(e.currentTarget.value)
                setError(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleConfirmAdd()
                } else if (e.key === 'Escape') {
                  handleCancelAdd()
                }
              }}
              placeholder={hasHeader() ? 'VAR_NAME' : 'KEY'}
              type="text"
              value={newKey()}
            />

            <Show
              fallback={
                <textarea
                  class="mt-[1px] min-w-0 flex-1 resize-none overflow-hidden rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[11px] break-all text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  onInput={e => {
                    autoResize(e.currentTarget)
                    setNewValue(e.currentTarget.value)
                  }}
                  onKeyDown={e => {
                    // Enter 确认添加，Shift+Enter 允许换行
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleConfirmAdd()
                    } else if (e.key === 'Escape') {
                      handleCancelAdd()
                    }
                  }}
                  placeholder={props.valuePlaceholder ?? 'Value'}
                  ref={element =>
                    setTimeout(() => {
                      autoResize(element)
                    }, 0)
                  }
                  rows={1}
                  value={newValue()}
                />
              }
              when={props.valueOptions}
            >
              <select
                class="mt-[1px] min-w-0 flex-1 cursor-pointer appearance-none rounded border border-gray-300 bg-gray-50 px-1 py-0.5 text-[11px] text-gray-900 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                onChange={e => setNewValue(e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleConfirmAdd()
                  } else if (e.key === 'Escape') {
                    handleCancelAdd()
                  }
                }}
                value={newValue() || defaultValue()}
              >
                <For each={props.valueOptions}>
                  {opt => <option value={opt.value}>{opt.label}</option>}
                </For>
              </select>
            </Show>

            <div class="mt-[2px] flex gap-0.5">
              <button
                class="px-0.5 text-[11px] text-green-600 hover:text-green-500 dark:text-green-500 dark:hover:text-green-300"
                onClick={handleConfirmAdd}
                type="button"
              >
                ✓
              </button>
              <button
                class="px-0.5 text-[11px] text-red-600 hover:text-red-500 dark:text-red-500 dark:hover:text-red-300"
                onClick={handleCancelAdd}
                type="button"
              >
                ✕
              </button>
            </div>
          </div>
          <Show when={error()}>
            <span class="mb-1 px-1 text-[9px] text-red-500">{error()}</span>
          </Show>
        </Show>

        {/* Existing entries */}
        <Show
          fallback={
            <div class="flex flex-1 items-center justify-center text-[11px] text-gray-400 select-none">
              {props.emptyText ?? t('ui.none')}
            </div>
          }
          when={sortedKeys().length > 0 || isAdding()}
        >
          <For each={sortedKeys()}>
            {key => (
              // items-center 改为 items-start，适配多行高度
              <div class="group flex items-start gap-1 rounded border border-gray-200 bg-white px-1 py-0.5 transition-colors hover:bg-gray-50 dark:border-transparent dark:bg-gray-700/50 dark:hover:bg-gray-700">
                <input
                  class="mt-[1px] w-1/3 min-w-[50px] truncate rounded border border-transparent bg-transparent py-0 pr-0.5 pl-0.5 font-mono text-[11px] text-blue-600 transition-all outline-none hover:border-gray-300 focus:border-blue-500 focus:bg-gray-100 dark:text-blue-300 dark:hover:border-gray-600 dark:focus:bg-gray-900"
                  onBlur={e => {
                    handleKeyBlur(key, e.currentTarget.value)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    }
                  }}
                  type="text"
                  value={key}
                />
                <span class="mt-[2px] text-[10px] text-gray-400">=</span>
                <Show
                  fallback={
                    <textarea
                      class="mt-[1px] min-w-0 flex-1 resize-none overflow-hidden rounded border border-transparent bg-transparent px-0.5 py-0 text-[11px] break-all text-gray-800 transition-all outline-none hover:border-gray-300 focus:border-blue-500 focus:bg-gray-100 dark:text-gray-200 dark:hover:border-gray-600 dark:focus:bg-gray-900"
                      onBlur={e => {
                        const newValue_ = e.currentTarget.value
                        if (newValue_ !== (props.values[key] ?? '')) {
                          props.onCommit({
                            ...props.values,
                            [key]: newValue_
                          })
                        }
                      }}
                      onInput={e => {
                        autoResize(e.currentTarget)
                      }}
                      onKeyDown={e => {
                        // Enter 失去焦点并保存，Shift+Enter 允许修改为多行
                        if (e.key !== 'Enter' || e.shiftKey) {
                          return
                        }

                        e.preventDefault()
                        e.currentTarget.blur()
                      }}
                      ref={element =>
                        setTimeout(() => {
                          autoResize(element)
                        }, 0)
                      }
                      rows={1}
                      value={props.values[key] ?? ''}
                    />
                  }
                  when={props.valueOptions}
                >
                  <select
                    class="mt-[1px] min-w-0 flex-1 cursor-pointer appearance-none rounded border border-transparent bg-transparent px-0.5 py-0 text-[11px] text-gray-800 transition-all outline-none hover:border-gray-300 focus:border-blue-500 focus:bg-gray-100 dark:text-gray-200 dark:hover:border-gray-600 dark:focus:bg-gray-900"
                    onChange={e => {
                      const newValue_ = e.currentTarget.value
                      if (newValue_ !== (props.values[key] ?? '')) {
                        props.onCommit({ ...props.values, [key]: newValue_ })
                      }
                    }}
                    value={props.values[key] ?? defaultValue()}
                  >
                    <For each={props.valueOptions}>
                      {opt => <option value={opt.value}>{opt.label}</option>}
                    </For>
                  </select>
                </Show>
                <button
                  class="mt-[1px] px-0 text-[11px] text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 focus:opacity-100 dark:hover:text-red-400"
                  onClick={() => {
                    const updated = { ...props.values }
                    delete updated[key]
                    props.onCommit(updated)
                  }}
                  tabIndex={-1}
                  type="button"
                >
                  ✕
                </button>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

import { createMemo, createSignal, For, Show, type Component } from 'solid-js'
import toast from 'solid-toast'

interface VariableEditorProps {
  /** 变量键值对 Map */
  variables: { [key in string]?: string }
  /** 标签名称，默认为 "Variables" */
  label?: string
  /**
   * 添加变量的回调
   * @throws Error 如果 key 已存在，UI 层会捕获并提示
   */
  onAdd: (key: string, value: string) => void
  /** 移除变量的回调 */
  onRemove: (key: string) => void
  /** 更新变量值的回调 */
  onUpdateValue: (key: string, newValue: string) => void
  /**
   * 重命名变量 Key 的回调
   * 通常实现为：添加新 Key + 复制 Value -> 删除旧 Key
   */
  onRenameKey: (oldKey: string, newKey: string) => void
}

export const VariableEditor: Component<VariableEditorProps> = props => {
  // 内部状态：是否正在添加新变量
  const [isAdding, setIsAdding] = createSignal(false)
  // 新变量的临时状态
  const [newKey, setNewKey] = createSignal('')
  const [newValue, setNewValue] = createSignal('')
  // 错误提示（如 Key 重复）
  const [error, setError] = createSignal<string | null>(null)

  // 将对象转换为数组并排序，保证渲染顺序稳定（按 Key 字母序）
  const sortedEntries = createMemo(() =>
    Object.entries(props.variables).sort(([a], [b]) => a.localeCompare(b))
  )

  // 处理添加逻辑
  const handleConfirmAdd = () => {
    const key = newKey().trim()
    const val = newValue().trim()

    if (!key) {
      setError('Key cannot be empty')
      return
    }
    if (props.variables.hasOwnProperty(key)) {
      setError('Key already exists')
      return
    }

    props.onAdd(key, val)
    // 重置状态
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

  // 处理 Key 重命名逻辑
  const handleKeyBlur = (oldKey: string, inputKey: string) => {
    const trimmedNewKey = inputKey.trim()
    if (trimmedNewKey === oldKey) return // 未改变
    if (!trimmedNewKey) return // 不能为空（或者你可以选择 revert）

    if (props.variables.hasOwnProperty(trimmedNewKey)) {
      toast.error(`Key "${trimmedNewKey}" already exists`)
      return
    }

    props.onRenameKey(oldKey, trimmedNewKey)
  }

  return (
    <div class="flex flex-col gap-2 w-full">
      {/* Header */}
      <div class="flex justify-between items-center">
        <div class="flex flex-col">
          <span class="text-sm text-gray-300">{props.label || 'Path Variables'}</span>
          <span class="text-[10px] text-gray-500">
            Define variables for current device. This will be inserted into template
            paths.
          </span>
        </div>
        <button
          onClick={() => {
            setIsAdding(true)
            setError(null)
          }}
          disabled={isAdding()}
          class="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2 py-1 rounded transition-colors cursor-pointer"
          type="button"
        >
          + Add Variable
        </button>
      </div>

      {/* List Container */}
      <div class="bg-gray-800 rounded border border-gray-600 p-2 min-h-[80px] max-h-[300px] overflow-y-auto flex flex-col gap-1">
        {/* Add New Row (Inline Form) */}
        <Show when={isAdding()}>
          <div class="flex flex-col gap-1 bg-gray-900/50 p-2 rounded border border-blue-500/50 mb-1">
            <div class="flex items-center gap-2">
              <input
                type="text"
                placeholder="VAR_NAME"
                value={newKey()}
                onInput={e => {
                  setNewKey(e.currentTarget.value)
                  setError(null)
                }}
                onKeyDown={e =>
                  (e.key === 'Enter' && handleConfirmAdd()) ||
                  (e.key === 'Escape' && handleCancelAdd())
                }
                class="w-1/3 bg-gray-900 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none font-mono placeholder-gray-600"
                autofocus
              />
              <input
                type="text"
                placeholder="Value (e.g. C:/Games)"
                value={newValue()}
                onInput={e => setNewValue(e.currentTarget.value)}
                onKeyDown={e =>
                  (e.key === 'Enter' && handleConfirmAdd()) ||
                  (e.key === 'Escape' && handleCancelAdd())
                }
                class="flex-1 bg-gray-900 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-500 outline-none min-w-0"
              />
              <div class="flex gap-1">
                <button
                  onClick={handleConfirmAdd}
                  class="text-green-500 hover:text-green-300 px-1"
                  title="Save"
                >
                  ✓
                </button>
                <button
                  onClick={handleCancelAdd}
                  class="text-red-500 hover:text-red-300 px-1"
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            </div>
            <Show when={error()}>
              <span class="text-[10px] text-red-400 px-1">{error()}</span>
            </Show>
          </div>
        </Show>

        {/* Empty State */}
        <Show
          when={sortedEntries().length > 0 || isAdding()}
          fallback={
            <div class="flex-1 flex items-center justify-center text-gray-500 text-xs select-none py-4">
              No variables defined.
            </div>
          }
        >
          {/* Variable List */}
          <For each={sortedEntries()}>
            {([key, value]) => (
              <div class="flex items-center gap-2 bg-gray-700/50 px-2 py-1 rounded group hover:bg-gray-700 transition-colors">
                {/* Key Input (Editable but distinct) */}
                <div class="w-1/3 min-w-[80px] relative">
                  <input
                    type="text"
                    value={key}
                    // 失去焦点或回车时触发重命名
                    onBlur={e => handleKeyBlur(key, e.currentTarget.value)}
                    onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                    class="w-full bg-transparent text-blue-300 font-mono text-xs pl-1 pr-1 py-0.5 rounded border border-transparent hover:border-gray-600 focus:bg-gray-900 focus:border-blue-500 outline-none transition-all truncate"
                    title="Edit Variable Name"
                  />
                </div>

                {/* Separator */}
                <span class="text-gray-500 text-xs">=</span>

                {/* Value Input */}
                <input
                  type="text"
                  value={value}
                  onInput={e => props.onUpdateValue(key, e.currentTarget.value)}
                  class="flex-1 bg-transparent text-gray-200 text-xs px-1 py-0.5 rounded border border-transparent hover:border-gray-600 focus:bg-gray-900 focus:border-blue-500 outline-none transition-all min-w-0 placeholder-gray-600"
                  placeholder="Value..."
                />

                {/* Delete Button */}
                <button
                  onClick={() => props.onRemove(key)}
                  class="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-1"
                  title="Remove Variable"
                  tabIndex={-1}
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

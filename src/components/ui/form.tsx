/**
 * form.tsx — Form composites for compact inline forms.
 *
 * Re-exports primitive controls from controls.tsx with compact (`size='sm'`)
 * defaults under the `Form*` naming convention. Provides higher-level
 * composites: FormField, FormPathInput, FormTableEditor.
 */
import { Tooltip } from '@kobalte/core/tooltip'
import { open } from '@tauri-apps/plugin-dialog'
import { fuckBackslash } from '@utils/path'
import { useI18n } from '~/i18n'
import { cn } from '~/lib/utils'
import { FiAlertCircle, FiAlertTriangle, FiInfo } from 'solid-icons/fi'
import {
  createSignal,
  For,
  mergeProps,
  Show,
  splitProps,
  type Component,
  type JSX
} from 'solid-js'
import toast from 'solid-toast'
import {
  Button,
  Input,
  Select,
  Switch,
  Textarea,
  type ButtonProps,
  type InputProps,
  type SelectProps,
  type SwitchProps,
  type TextareaProps
} from './controls'

// ─── Re-exports with compact defaults ───────────────────────────────────────

export interface FormInputProps extends InputProps {
  /**
   * Transform function applied when the value is pasted into the input.
   * Receives the raw pasted text and must return the transformed string.
   */
  onBulkInput?: (value: string) => string
}

export const FormInput: Component<FormInputProps> = props => {
  const [local, rest] = splitProps(props, ['class', 'size', 'onBulkInput', 'onInput'])
  return (
    <Input
      size={local.size ?? 'sm'}
      class={local.class}
      {...rest}
      onInput={e => {
        if (e.inputType === 'insertFromPaste' && local.onBulkInput) {
          const input = e.currentTarget
          const transformed = local.onBulkInput(input.value)
          if (transformed !== input.value) {
            input.value = transformed
          }
        }
        if (typeof local.onInput === 'function') {
          local.onInput(e)
        }
      }}
    />
  )
}

export const FormSelect: Component<SelectProps> = props => {
  const mergedProps = mergeProps({ size: 'sm' as const }, props)
  return <Select {...mergedProps} />
}

export const FormSwitch: Component<SwitchProps> = props => {
  const mergedProps = mergeProps({ size: 'sm' as const }, props)
  return <Switch {...mergedProps} />
}

export const FormButton: Component<ButtonProps> = props => {
  const mergedProps = mergeProps({ size: 'sm' as const }, props)
  return <Button {...mergedProps} />
}

export const FormTextarea: Component<TextareaProps> = props => {
  const mergedProps = mergeProps({ size: 'sm' as const }, props)
  return <Textarea {...mergedProps} />
}

// ─── FormField ──────────────────────────────────────────────────────────────

export interface FormFieldProps {
  label?: string
  /** Override the label element class. */
  labelClass?: string
  description?: string
  /** Warning hint rendered below the children area (amber, icon + text). */
  warning?: string
  /** Error hint rendered below the children area (red, icon + text). */
  error?: string
  /** Override the children wrapper div class (default: `flex items-center min-h-7`). */
  childrenClass?: string
  class?: string
  children: JSX.Element
}

/** Vertical field wrapper: label (with optional hint tooltip) → children → warning/error. */
export const FormField: Component<FormFieldProps> = props => (
  <div class={cn('flex flex-col gap-1', props.class)}>
    <Show when={props.label}>
      <label
        class={cn(
          'flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300 select-none',
          props.labelClass
        )}
      >
        <span class="truncate min-w-0">{props.label}</span>
        <Show when={props.description}>
          <Tooltip openDelay={0} closeDelay={0}>
            <Tooltip.Trigger class="inline-flex items-center shrink-0 cursor-help text-gray-400 dark:text-gray-500">
              <FiInfo class="w-3 h-3" />
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content class="z-50 w-max max-w-[220px] rounded px-2 py-1 text-[10px] leading-tight font-normal bg-gray-800 text-gray-100 shadow-lg dark:bg-gray-200 dark:text-gray-800 animate-in fade-in">
                <Tooltip.Arrow />
                {props.description}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip>
        </Show>
      </label>
    </Show>
    <div class={props.childrenClass ?? 'flex items-center min-h-7'}>{props.children}</div>
    <Show when={props.warning}>
      <p class="flex items-center gap-1 text-[10px] leading-tight text-amber-600 dark:text-amber-400 select-none">
        <FiAlertTriangle class="w-3 h-3 shrink-0" />
        {props.warning}
      </p>
    </Show>
    <Show when={props.error}>
      <p class="flex items-center gap-1 text-[10px] leading-tight text-red-600 dark:text-red-400 select-none">
        <FiAlertCircle class="w-3 h-3 shrink-0" />
        {props.error}
      </p>
    </Show>
  </div>
)

// ─── FormPathInput ──────────────────────────────────────────────────────────

const DEFAULT_PATH_INPUT =
  'flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 transition-all outline-none h-7 px-2'

const DEFAULT_PATH_BTN =
  'inline-flex items-center justify-center rounded border shadow-sm transition-all h-7 px-2.5 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed'

export interface FormPathInputProps {
  value: string
  /** Commit callback — fires on blur (text) or after file dialog selection. */
  onCommit: (value: string) => void
  /**
   * Transform function applied when the value comes from a "bulk" source
   * (file-dialog selection or clipboard paste).
   *
   * The function receives the normalised value (backslashes already replaced)
   * and must return the transformed string.
   */
  onBulkInput?: (value: string) => string
  /**
   * Callback fired when a file/folder is selected via the browse dialog.
   * Receives the normalised path *before* `onBulkInput` is applied.
   * Useful for side-effects like auto-filling related fields.
   */
  onBrowse?: (selectedPath: string) => void
  isDir?: boolean
  placeholder?: string
  class?: string
  /** File dialog filters passed directly to `@tauri-apps/plugin-dialog`. */
  filters?: { name: string; extensions: string[] }[]
  /**
   * Extra class for the `<input>` element — merged via `cn()`
   */
  inputClass?: string
  /**
   * Extra class for the browse `<button>` — merged via `cn()`
   */
  buttonClass?: string
}

/** Text input + file/folder browse button with paste-aware bulk-input support. */
export const FormPathInput: Component<FormPathInputProps> = props => {
  const { t } = useI18n()
  const wrapperClass = () => cn('flex gap-2', props.class)
  const inputClass = () => cn(DEFAULT_PATH_INPUT, props.inputClass)
  const buttonClass = () => cn(DEFAULT_PATH_BTN, props.buttonClass)

  // Shared paste handling logic for both input modes
  const handlePasteDetect = (e: InputEvent) => {
    if (e.inputType === 'insertFromPaste') {
      const input = e.currentTarget as HTMLInputElement
      let val = fuckBackslash(input.value)
      if (props.onBulkInput) {
        val = props.onBulkInput(val)
      }
      input.value = val
      // Auto-commit on paste
      if (val !== props.value) {
        props.onCommit(val)
      }
    }
  }

  // Shared browse logic
  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: props.isDir ?? false,
        multiple: false,
        filters: props.filters
      })
      if (selected && typeof selected === 'string') {
        const normalized = fuckBackslash(selected)
        // Notify side-effects before transformation
        props.onBrowse?.(normalized)
        let val = normalized
        if (props.onBulkInput) {
          val = props.onBulkInput(val)
        }
        props.onCommit(val)
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div class={wrapperClass()}>
      <input
        type="text"
        value={props.value}
        class={inputClass()}
        onInput={handlePasteDetect}
        onBlur={(e: FocusEvent) => {
          const newVal = (e.target as HTMLInputElement).value
          if (newVal !== props.value) {
            props.onCommit(newVal)
          }
        }}
        placeholder={props.placeholder}
      />
      <button type="button" class={buttonClass()} onClick={handleBrowse}>
        {t('ui.browse')}
      </button>
    </div>
  )
}

// ─── FormTableEditor ────────────────────────────────────────────────────────

export interface FormTableEditorProps {
  /** Current key-value pairs */
  values: Record<string, string>
  /** Commit callback — fires when a value editing is committed (blur, delete, add). */
  onCommit: (values: Record<string, string>) => void
  /** When provided, renders a header with label + description + add button */
  label?: string
  /** Secondary text below the label */
  description?: string
  /** Text for the add button (e.g. "Add Variable") */
  addLabel?: string
  /** Empty-state placeholder text */
  emptyText?: string
  class?: string
}

/**
 * Inline key-value pair editor.
 *
 * When `label` is provided, renders a full header (label, description, add
 * button). Otherwise, renders a minimal "+" button — suitable for embedding
 * inside a FormField.
 *
 * This component supersedes the former VariableEditor. The callback-based
 * API (onAdd/onRemove/onRenameKey/onUpdateValue) is simplified to a single
 * `values / onChange` pair; the parent can diff and apply as needed.
 */
export const FormTableEditor: Component<FormTableEditorProps> = props => {
  const { t } = useI18n()
  const [isAdding, setIsAdding] = createSignal(false)
  const [newKey, setNewKey] = createSignal('')
  const [newValue, setNewValue] = createSignal('')
  const [error, setError] = createSignal<string | null>(null)

  const sortedKeys = () => Object.keys(props.values).sort((a, b) => a.localeCompare(b))

  const handleConfirmAdd = () => {
    const key = newKey().trim()
    const val = newValue().trim()
    if (!key) {
      setError('Key cannot be empty')
      return
    }
    if (Object.prototype.hasOwnProperty.call(props.values, key)) {
      setError('Key already exists')
      return
    }
    props.onCommit({ ...props.values, [key]: val })
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

  // Whether to show the full header (label + description + add button)
  const hasHeader = () => !!(props.label || props.addLabel)

  return (
    <div class={cn('flex flex-col gap-2 w-full', props.class)}>
      {/* Full header — shown when label or addLabel is provided */}
      <Show when={hasHeader()}>
        {/* 修改：去掉了 justify-between，保留 flex 和 items-center */}
        <div class="flex items-center">
          <Show when={props.label}>
            <div class="flex flex-col">
              <span class="text-sm text-gray-700 dark:text-gray-300">{props.label}</span>
              <Show when={props.description}>
                <span class="text-[10px] text-gray-500 dark:text-gray-400">
                  {props.description}
                </span>
              </Show>
            </div>
          </Show>
          <button
            onClick={() => {
              setIsAdding(true)
              setError(null)
            }}
            disabled={isAdding()}
            class="ml-auto text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-2 py-1 rounded transition-colors cursor-pointer"
            type="button"
          >
            + {props.addLabel ?? ''}
          </button>
        </div>
      </Show>

      {/* Minimal "+" button — shown when no header */}
      <Show when={!hasHeader()}>
        <div class="flex justify-end">
          <button
            onClick={() => {
              setIsAdding(true)
              setError(null)
            }}
            disabled={isAdding()}
            class="text-[10px] bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-1.5 py-0.5 rounded transition-colors cursor-pointer"
            type="button"
          >
            +
          </button>
        </div>
      </Show>

      {/* Editor area */}
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
          <div class="flex items-center gap-1 bg-white dark:bg-gray-900/50 p-1 rounded border border-blue-500/30 mb-0.5 shadow-sm dark:shadow-none">
            <input
              type="text"
              placeholder={hasHeader() ? 'VAR_NAME' : 'KEY'}
              value={newKey()}
              onInput={e => {
                setNewKey(e.currentTarget.value)
                setError(null)
              }}
              onKeyDown={e =>
                (e.key === 'Enter' && handleConfirmAdd()) ||
                (e.key === 'Escape' && handleCancelAdd())
              }
              class="w-1/3 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-[11px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 focus:border-blue-500 outline-none font-mono min-w-[50px]"
              autofocus
            />
            <input
              type="text"
              placeholder="Value"
              value={newValue()}
              onInput={e => setNewValue(e.currentTarget.value)}
              onKeyDown={e =>
                (e.key === 'Enter' && handleConfirmAdd()) ||
                (e.key === 'Escape' && handleCancelAdd())
              }
              class="flex-1 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-[11px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 focus:border-blue-500 outline-none min-w-0"
            />
            <div class="flex gap-0.5">
              <button
                onClick={handleConfirmAdd}
                class="text-green-600 hover:text-green-500 dark:text-green-500 dark:hover:text-green-300 px-0.5 text-[11px]"
                type="button"
              >
                ✓
              </button>
              <button
                onClick={handleCancelAdd}
                class="text-red-600 hover:text-red-500 dark:text-red-500 dark:hover:text-red-300 px-0.5 text-[11px]"
                type="button"
              >
                ✕
              </button>
            </div>
            <Show when={error()}>
              <span class="text-[9px] text-red-500 px-0.5">{error()}</span>
            </Show>
          </div>
        </Show>

        {/* Existing entries */}
        <Show
          when={sortedKeys().length > 0 || isAdding()}
          fallback={
            <div class="text-gray-400 text-[11px] select-none flex-1 flex items-center justify-center">
              {props.emptyText ?? t('ui.none')}
            </div>
          }
        >
          <For each={sortedKeys()}>
            {key => (
              <div class="flex items-center gap-1 bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-transparent px-1 py-0.5 rounded group hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <input
                  type="text"
                  value={key}
                  onBlur={e => handleKeyBlur(key, e.currentTarget.value)}
                  onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                  class="w-1/3 min-w-[50px] bg-transparent text-blue-600 dark:text-blue-300 font-mono text-[11px] pl-0.5 pr-0.5 py-0 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:bg-gray-100 dark:focus:bg-gray-900 focus:border-blue-500 outline-none transition-all truncate"
                />
                <span class="text-gray-400 text-[10px]">=</span>
                <input
                  type="text"
                  value={props.values[key] ?? ''}
                  onBlur={e => {
                    const newVal = e.currentTarget.value
                    if (newVal !== (props.values[key] ?? '')) {
                      props.onCommit({
                        ...props.values,
                        [key]: newVal
                      })
                    }
                  }}
                  class="flex-1 bg-transparent text-gray-800 dark:text-gray-200 text-[11px] px-0.5 py-0 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:bg-gray-100 dark:focus:bg-gray-900 focus:border-blue-500 outline-none transition-all min-w-0"
                />
                <button
                  onClick={() => {
                    const updated = { ...props.values }
                    delete updated[key]
                    props.onCommit(updated)
                  }}
                  class="text-gray-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-0 text-[11px]"
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

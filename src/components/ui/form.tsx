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
import { FiFolder, FiInfo } from 'solid-icons/fi'
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
import { FieldHint } from './FieldHint'

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
      <FieldHint variant="warning" text={props.warning} />
    </Show>
    <Show when={props.error}>
      <FieldHint variant="error" text={props.error} />
    </Show>
  </div>
)

// ─── FormPathInput ──────────────────────────────────────────────────────────

const DEFAULT_PATH_INPUT =
  'flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 transition-all outline-none h-7 px-2 '

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

  // 外层使用 grid 布局，这是实现 input 宽度随内容自适应的核心
  // min-w-[12rem] 保证没内容时也有一个基础宽度，max-w-full 防止撑爆屏幕
  const wrapperClass = () => cn('relative flex items-center w-full', props.class)
  const inputClass = () =>
    cn(DEFAULT_PATH_INPUT, 'col-start-1 row-start-1 w-full pr-8', props.inputClass)

  // 图标按钮：小巧的正方形，悬浮时显示半透明背景
  const buttonClass = () =>
    cn(
      'absolute right-1.5 top-1/2 -translate-y-1/2',
      'w-6 h-6 flex items-center justify-center rounded-md',
      'text-neutral-500 dark:text-neutral-400',
      'hover:bg-black/10 dark:hover:bg-white/10 hover:text-neutral-700 dark:hover:text-neutral-200',
      'transition-colors cursor-pointer',
      props.buttonClass
    )

  const handlePasteDetect = (e: InputEvent) => {
    if (e.inputType === 'insertFromPaste') {
      const input = e.currentTarget as HTMLInputElement
      let val = fuckBackslash(input.value)
      if (props.onBulkInput) {
        val = props.onBulkInput(val)
      }
      input.value = val
      if (val !== props.value) {
        props.onCommit(val)
      }
    }
  }

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: props.isDir ?? false,
        multiple: false,
        filters: props.filters
      })
      if (selected && typeof selected === 'string') {
        const normalized = fuckBackslash(selected)
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

      <button
        type="button"
        class={buttonClass()}
        onClick={handleBrowse}
        title={t('ui.browse')}
      >
        <FiFolder class="w-4 h-4" />
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
  labelClass?: string
  /** Secondary text below the label */
  description?: string
  /** Text for the add button (e.g. "Add Variable") */
  addLabel?: string
  /** Empty-state placeholder text */
  emptyText?: string
  class?: string
}

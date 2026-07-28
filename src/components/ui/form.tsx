/**
 * form.tsx — Form composites for compact inline forms.
 *
 * Re-exports primitive controls from controls.tsx with compact (`size='sm'`)
 * defaults under the `Form*` naming convention. Provides higher-level
 * composites: FormField, FormPathInput, FormTableEditor.
 */
import { Tooltip } from '@kobalte/core/tooltip'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { fuckBackslash } from '@utils/path'
import { resolveVar } from '@utils/resolveVar'
import { useVarMap } from '@utils/useVarMap'
import { useVarWarning } from '@utils/useVarWarning'
import { useI18n } from '~/i18n'
import { cn } from '~/lib/utils'
import { FiFolder, FiInfo } from 'solid-icons/fi'
import {
  createResource,
  mergeProps,
  Show,
  splitProps,
  type Component,
  type JSX
} from 'solid-js'
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
   * Enable validation of `{var}` placeholders against the current device's
   * variable map. When enabled, unknown variable names trigger a warning
   * hint below the input.
   *
   * @default false
   */
  checkVars?: boolean
  /**
   * Transform function applied when the value is pasted into the input.
   * Receives the raw pasted text and must return the transformed string.
   */
  onBulkInput?: (value: string) => string
  /**
   * External warning text rendered below the input (amber, icon + text).
   */
  warning?: string
}

export const FormInput: Component<FormInputProps> = props => {
  const [local, rest] = splitProps(props, [
    'size',
    'onBulkInput',
    'onInput',
    'checkVars',
    'warning',
    'value'
  ])

  const variableWarning = useVarWarning(
    () => (typeof local.value === 'string' ? local.value : ''),
    () => !!local.checkVars
  )

  return (
    <div class="flex flex-col w-full">
      <Input
        size={local.size ?? 'sm'}
        value={local.value}
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
      <div class="flex flex-col gap-1 mt-1">
        <Show when={variableWarning()}>
          <FieldHint text={variableWarning()} variant="warning" />
        </Show>
        <Show when={local.warning}>
          <FieldHint text={local.warning} variant="warning" />
        </Show>
      </div>
    </div>
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

// ─── FormField ───

export interface FormFieldProps {
  children: JSX.Element
  /** Override the children wrapper div class (default: `flex items-center min-h-7`). */
  childrenClass?: string
  class?: string
  description?: string
  /** Error hint rendered below the children area (red, icon + text). */
  error?: string
  label?: string
  /** Override the label element class. */
  labelClass?: string
  /** Warning hint rendered below the children area (amber, icon + text). */
  warning?: string
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
          <Tooltip closeDelay={0} openDelay={0}>
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
      <FieldHint text={props.warning} variant="warning" />
    </Show>
    <Show when={props.error}>
      <FieldHint text={props.error} variant="error" />
    </Show>
  </div>
)

// ─── FormPathInput ──────────────────────────────────────────────────────────

const DEFAULT_PATH_INPUT =
  'flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500 transition-all outline-none h-7 px-2 '

export interface FormPathInputProps {
  /**
   * Extra class for the browse `<button>` — merged via `cn()`
   */
  buttonClass?: string
  /**
   * Enable asynchronous path-existence validation. When enabled, the
   * resolved path (after variable substitution) is checked against the
   * local filesystem via `paths_exist`. A warning is shown if the path
   * does not exist.
   *
   * @default false
   */
  checkPathExist?: boolean
  /**
   * Enable validation of `{var}` placeholders against the current device's
   * variable map. When enabled, unknown variable names trigger a warning
   * hint below the input.
   *
   * @default true
   */
  checkVars?: boolean
  class?: string
  /** File dialog filters passed directly to `@tauri-apps/plugin-dialog`. */
  filters?: { extensions: string[]; name: string }[]
  /**
   * Extra class for the `<input>` element — merged via `cn()`
   */
  inputClass?: string
  isDir?: boolean
  /**
   * Callback fired when a file/folder is selected via the browse dialog.
   * Receives the normalised path *before* `onBulkInput` is applied.
   * Useful for side-effects like auto-filling related fields.
   */
  onBrowse?: (selectedPath: string) => void
  /**
   * Transform function applied when the value comes from a "bulk" source
   * (file-dialog selection or clipboard paste).
   *
   * The function receives the normalised value (backslashes already replaced)
   * and must return the transformed string.
   */
  onBulkInput?: (value: string) => string
  /** Commit callback — fires on blur (text) or after file dialog selection. */
  onCommit: (value: string) => void
  placeholder?: string
  value: string
  /**
   * External warning text rendered below the input (amber, icon + text),
   * e.g., a path-existence check result.
   */
  warning?: string
}

/** Text input + file/folder browse button with var validation and warning hints. */
export const FormPathInput: Component<FormPathInputProps> = props => {
  const { t } = useI18n()
  const variableMap = useVarMap()

  // Var validation — checks for unknown {key} references
  const variableWarning = useVarWarning(
    () => props.value,
    () => props.checkVars !== false
  )

  // Path existence validation — async check via `paths_exist`
  const [pathExistWarning] = createResource(
    () => ({
      enabled: props.checkPathExist === true,
      path: props.value,
      vars: variableMap()
    }),
    async ({ enabled, path, vars }) => {
      if (!enabled || !path || !vars) return
      try {
        const resolved = resolveVar(path, vars)
        const results = await invoke<boolean[]>('paths_exist', { paths: [resolved] })
        return results[0] ? undefined : t('hint.pathNotExist')
      } catch {
        return
      }
    }
  )

  const wrapperClass = () => cn('flex flex-col', props.class)
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
    if (e.inputType !== 'insertFromPaste') {
      return
    }

    const input = e.currentTarget as HTMLInputElement
    let value = fuckBackslash(input.value)
    if (props.onBulkInput) {
      value = props.onBulkInput(value)
    }
    input.value = value
    if (value !== props.value) {
      props.onCommit(value)
    }
  }

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: props.isDir ?? false,
        filters: props.filters,
        multiple: false
      })
      if (selected && typeof selected === 'string') {
        const normalized = fuckBackslash(selected)
        props.onBrowse?.(normalized)
        let value = normalized
        if (props.onBulkInput) {
          value = props.onBulkInput(value)
        }
        props.onCommit(value)
      }
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div class={wrapperClass()}>
      {/* Input row: text input + browse button */}
      <div class="relative flex items-center w-full">
        <input
          class={inputClass()}
          onBlur={(e: FocusEvent) => {
            const newValue = (e.target as HTMLInputElement).value
            if (newValue !== props.value) {
              props.onCommit(newValue)
            }
          }}
          onInput={handlePasteDetect}
          placeholder={props.placeholder}
          type="text"
          value={props.value}
        />

        <button
          class={buttonClass()}
          onClick={handleBrowse}
          title={t('ui.browse')}
          type="button"
        >
          <FiFolder class="w-4 h-4" />
        </button>
      </div>

      {/* Warning hints — stacked below the input */}
      <div class="flex flex-col gap-2 mt-2">
        <Show when={variableWarning()}>
          <FieldHint text={variableWarning()} variant="warning" />
        </Show>
        <Show when={pathExistWarning()}>
          <FieldHint text={pathExistWarning()} variant="warning" />
        </Show>
        <Show when={props.warning}>
          <FieldHint text={props.warning} variant="warning" />
        </Show>
      </div>
    </div>
  )
}

// ─── FormTableEditor ────────────────────────────────────────────────────────

export interface FormTableEditorProps {
  /** Text for the add button (e.g. "Add Variable") */
  addLabel?: string
  class?: string
  /** Secondary text below the label */
  description?: string
  /** Empty-state placeholder text */
  emptyText?: string
  /** When provided, renders a header with label + description + add button */
  label?: string
  labelClass?: string
  /** Commit callback — fires when a value editing is committed (blur, delete, add). */
  onCommit: (values: Record<string, string>) => void
  /**
   * Fixed set of allowed values. When provided, the value cell renders as
   * a `<select>` rather than a free-form `<textarea>`, useful for enum
   * types such as Wine DLL overrides.
   */
  valueOptions?: readonly FormTableEditorValueOption[]
  /** Placeholder for the value input when `valueOptions` is not provided. */
  valuePlaceholder?: string
  /** Current key-value pairs */
  values: Record<string, string>
}

export interface FormTableEditorValueOption {
  label: string
  value: string
}

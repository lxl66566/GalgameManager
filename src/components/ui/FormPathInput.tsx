/**
 * FormPathInput.tsx — Text input + file/folder browse button with
 * paste-aware bulk-input support.
 *
 * Built on top of the shared Input and Button primitives.
 */
import { open } from '@tauri-apps/plugin-dialog'
import { fuckBackslash } from '@utils/path'
import { useI18n } from '~/i18n'
import { cn } from '~/lib/utils'
import { splitProps, type Component } from 'solid-js'

import { Button } from './Button'
import { Input } from './Input'
import type { ControlSize } from './Input'

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
  /** Size for the internal Input and Button (defaults to 'sm'). */
  size?: ControlSize
}

/** Text input + file/folder browse button with paste-aware bulk-input support. */
export const FormPathInput: Component<FormPathInputProps> = props => {
  const { t } = useI18n()
  const [local, others] = splitProps(props, [
    'class', 'value', 'onCommit', 'onBulkInput', 'onBrowse',
    'isDir', 'placeholder', 'filters', 'size'
  ])
  const s = () => local.size ?? 'sm'

  // Shared paste handling logic for both input modes
  const handlePasteDetect = (e: InputEvent) => {
    if (e.inputType === 'insertFromPaste') {
      const input = e.currentTarget as HTMLInputElement
      let val = fuckBackslash(input.value)
      if (local.onBulkInput) {
        val = local.onBulkInput(val)
      }
      input.value = val
      // Auto-commit on paste
      if (val !== local.value) {
        local.onCommit(val)
      }
    }
  }

  // Shared browse logic
  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: local.isDir ?? false,
        multiple: false,
        filters: local.filters
      })
      if (selected && typeof selected === 'string') {
        const normalized = fuckBackslash(selected)
        // Notify side-effects before transformation
        local.onBrowse?.(normalized)
        let val = normalized
        if (local.onBulkInput) {
          val = local.onBulkInput(val)
        }
        local.onCommit(val)
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div class={cn('flex gap-2', local.class)}>
      <Input
        type="text"
        size={s()}
        value={local.value}
        class="flex-1 min-w-0"
        onInput={handlePasteDetect}
        onBlur={(e: FocusEvent) => {
          const newVal = (e.target as HTMLInputElement).value
          if (newVal !== local.value) {
            local.onCommit(newVal)
          }
        }}
        placeholder={local.placeholder}
      />
      <Button size={s()} onClick={handleBrowse}>
        {t('ui.browse')}
      </Button>
    </div>
  )
}

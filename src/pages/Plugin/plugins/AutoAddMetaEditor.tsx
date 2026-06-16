/**
 * Shared meta editor for plugins whose only metadata field is `autoAdd`.
 *
 * Every built-in plugin currently exposes just the "auto-add to new games"
 * toggle in its metadata, so this generic component replaces seven identical
 * per-plugin copies. It stays generic over `T` (constrained to have
 * `autoAdd`) so each plugin definition still gets full type inference.
 */
import { FormField, FormSwitch } from '@components/ui/form'
import { useI18n } from '~/i18n'
import type { JSX } from 'solid-js'

import type { ConfigEditorProps } from './types'

export function AutoAddMetaEditor<T extends { autoAdd: boolean }>(
  props: ConfigEditorProps<T>
): JSX.Element {
  const { t } = useI18n()
  return (
    <div class="flex flex-wrap gap-3 items-start">
      <FormField label={t('plugin.autoAdd')} class="w-auto">
        <FormSwitch
          checked={props.config.autoAdd}
          onChange={(checked: boolean) =>
            props.onCommit({ ...props.config, autoAdd: checked })
          }
        />
      </FormField>
    </div>
  )
}

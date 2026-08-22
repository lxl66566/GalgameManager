/**
 * AutoUpload plugin — self-contained definition file.
 */
import type { AutoUploadGameConfig } from '@bindings/AutoUploadGameConfig'
import type { RetentionScope } from '@bindings/RetentionScope'
import { FormField, FormInput, FormSelect } from '@components/ui/form'
import type { JSX } from 'solid-js'

import { useI18n } from '~/i18n'

import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

function AutoUploadGameConfigEditor(
  props: ConfigEditorProps<AutoUploadGameConfig>
): JSX.Element {
  const { t } = useI18n()

  /** Parse a non-negative integer; falls back to the current value on invalid
   *  input. 0 means unlimited retention. */
  const parseMaxKept = (raw: string): number => {
    const value = Math.floor(Number(raw))
    return Number.isFinite(value) && value >= 0 ? value : props.config.maxKept
  }

  return (
    <div class="flex flex-wrap items-start gap-5">
      <FormField
        class="w-28"
        description={t('plugin.autoUpload.maxKeptDesc')}
        label={t('plugin.autoUpload.maxKept')}
      >
        <FormInput
          class="w-full"
          inputmode="numeric"
          onBlur={(e: FocusEvent) => {
            const element = e.target as HTMLInputElement
            const parsed = parseMaxKept(element.value)
            element.value = String(parsed)
            if (parsed !== props.config.maxKept) {
              props.onCommit({ ...props.config, maxKept: parsed })
            }
          }}
          type="text"
          value={String(props.config.maxKept)}
        />
      </FormField>
      <FormField class="w-40" label={t('plugin.autoUpload.retentionScope')}>
        <FormSelect
          class="w-full"
          onChange={(e: Event) => {
            props.onCommit({
              ...props.config,
              retentionScope: (e.target as HTMLSelectElement).value as RetentionScope
            })
          }}
          options={[
            { label: t('plugin.autoUpload.scopeBoth'), value: 'both' },
            { label: t('plugin.autoUpload.scopeLocal'), value: 'local' },
            { label: t('plugin.autoUpload.scopeRemote'), value: 'remote' }
          ]}
          value={props.config.retentionScope}
        />
      </FormField>
    </div>
  )
}

export const AUTO_UPLOAD_PLUGIN: PluginDefinition<'autoUpload'> = {
  configDefaults: { maxKept: 20, retentionScope: 'both' },
  GameEditor: AutoUploadGameConfigEditor,
  info: {
    author: 'BUILTIN',
    descriptionKey: 'plugin.autoUpload.description',
    id: 'autoUpload',
    links: [],
    nameKey: 'plugin.autoUpload.name',
    version: '1.3.2'
  },
  MetaEditor: AutoAddMetaEditor,
  metaKey: 'autoUpload'
}

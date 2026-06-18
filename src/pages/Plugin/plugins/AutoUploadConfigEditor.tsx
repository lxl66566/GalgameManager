/**
 * AutoUpload plugin — self-contained definition file.
 */
import type { AutoUploadGameConfig } from '@bindings/AutoUploadGameConfig'
import type { RetentionScope } from '@bindings/RetentionScope'
import { FormField, FormInput, FormSelect } from '@components/ui/form'
import { useI18n } from '~/i18n'
import type { JSX } from 'solid-js'
import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

function AutoUploadGameConfigEditor(
  props: ConfigEditorProps<AutoUploadGameConfig>
): JSX.Element {
  const { t } = useI18n()

  /** Parse a non-negative integer; falls back to the current value on invalid
   *  input. 0 means unlimited retention. */
  const parseMaxKept = (raw: string): number => {
    const val = Math.floor(Number(raw))
    return Number.isFinite(val) && val >= 0 ? val : props.config.maxKept
  }

  return (
    <div class="flex flex-wrap gap-5 items-start">
      <FormField
        label={t('plugin.autoUpload.maxKept')}
        description={t('plugin.autoUpload.maxKeptDesc')}
        class="w-28"
      >
        <FormInput
          class="w-full"
          type="text"
          inputmode="numeric"
          value={String(props.config.maxKept)}
          onBlur={(e: FocusEvent) => {
            const el = e.target as HTMLInputElement
            const parsed = parseMaxKept(el.value)
            el.value = String(parsed)
            if (parsed !== props.config.maxKept) {
              props.onCommit({ ...props.config, maxKept: parsed })
            }
          }}
        />
      </FormField>
      <FormField label={t('plugin.autoUpload.retentionScope')} class="w-40">
        <FormSelect
          class="w-full"
          options={[
            { label: t('plugin.autoUpload.scopeBoth'), value: 'both' },
            { label: t('plugin.autoUpload.scopeLocal'), value: 'local' },
            { label: t('plugin.autoUpload.scopeRemote'), value: 'remote' }
          ]}
          value={props.config.retentionScope}
          onChange={(e: Event) =>
            props.onCommit({
              ...props.config,
              retentionScope: (e.target as HTMLSelectElement).value as RetentionScope
            })
          }
        />
      </FormField>
    </div>
  )
}

export const AUTO_UPLOAD_PLUGIN: PluginDefinition<'autoUpload'> = {
  info: {
    id: 'autoUpload',
    nameKey: 'plugin.autoUpload.name',
    descriptionKey: 'plugin.autoUpload.description',
    version: '1.2.0',
    author: 'BUILTIN',
    links: []
  },
  metaKey: 'autoUpload',
  configDefaults: { maxKept: 20, retentionScope: 'both' },
  MetaEditor: AutoAddMetaEditor,
  GameEditor: AutoUploadGameConfigEditor
}

/**
 * AutoUpload plugin — self-contained definition file.
 */
import type { AutoUploadPluginMeta } from '@bindings/AutoUploadPluginMeta'
import { FormField, FormSwitch } from '@components/ui/form'
import { useI18n } from '~/i18n'
import type { ConfigEditorProps, PluginDefinition } from './types'

function AutoUploadMetaEditor(props: ConfigEditorProps<AutoUploadPluginMeta>) {
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

export const AUTO_UPLOAD_PLUGIN: PluginDefinition<'autoUpload'> = {
  info: {
    id: 'autoUpload',
    nameKey: 'plugin.autoUpload.name',
    descriptionKey: 'plugin.autoUpload.description',
    version: '1.0.1',
    author: 'BUILTIN',
    links: []
  },
  metaKey: 'autoUpload',
  MetaEditor: AutoUploadMetaEditor
}

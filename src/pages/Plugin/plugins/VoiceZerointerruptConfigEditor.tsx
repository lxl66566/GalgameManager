/**
 * VoiceZerointerrupt plugin — self-contained definition file.
 */
import type { VoiceZerointerruptGameConfig } from '@bindings/VoiceZerointerruptGameConfig'
import type { VoiceZerointerruptPluginMeta } from '@bindings/VoiceZerointerruptPluginMeta'
import { FormField, FormSelect, FormSwitch } from '@components/ui/form'
import { useI18n } from '~/i18n'
import type { ConfigEditorProps, PluginDefinition } from './types'

function VoiceZerointerruptMetaEditor(
  props: ConfigEditorProps<VoiceZerointerruptPluginMeta>
) {
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

function VoiceZerointerruptGameConfigEditor(
  props: ConfigEditorProps<VoiceZerointerruptGameConfig>
) {
  const { t } = useI18n()
  return (
    <div class="flex flex-wrap gap-3 items-start">
      <FormField label={t('plugin.arch')} class="w-28">
        <FormSelect
          options={[
            { label: t('plugin.archAuto'), value: 'auto' },
            { label: 'x86', value: 'x86' },
            { label: 'x64', value: 'x64' }
          ]}
          value={props.config.arch}
          onChange={(e: Event) =>
            props.onCommit({
              ...props.config,
              arch: (e.target as HTMLSelectElement).value as 'auto' | 'x86' | 'x64'
            })
          }
        />
      </FormField>
    </div>
  )
}

export const VOICE_ZEROINTERRUPT_PLUGIN: PluginDefinition<'voiceZerointerrupt'> = {
  info: {
    id: 'voiceZerointerrupt',
    nameKey: 'plugin.voiceZerointerrupt.name',
    descriptionKey: 'plugin.voiceZerointerrupt.description',
    version: '1.2.0',
    author: 'lxl66566',
    links: [
      {
        label: 'GitHub',
        url: 'https://github.com/lxl66566/AudioSpeedHack'
      }
    ]
  },
  metaKey: 'voiceZerointerrupt',
  configDefaults: { arch: 'auto' },
  MetaEditor: VoiceZerointerruptMetaEditor,
  GameEditor: VoiceZerointerruptGameConfigEditor
}

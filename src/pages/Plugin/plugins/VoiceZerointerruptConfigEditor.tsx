/**
 * VoiceZerointerrupt plugin — self-contained definition file.
 */
import type { VoiceZerointerruptGameConfig } from '@bindings/VoiceZerointerruptGameConfig'
import { FieldHint } from '@components/ui/FieldHint'
import { FormField, FormSelect } from '@components/ui/form'
import { useI18n } from '~/i18n'
import { useConfig } from '~/store'
import { isLinux } from '~/utils/platform'
import { Show } from 'solid-js'
import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

function VoiceZerointerruptGameConfigEditor(
  props: ConfigEditorProps<VoiceZerointerruptGameConfig>
) {
  const { t } = useI18n()
  const { config } = useConfig()

  const showWineRequired = () => isLinux && !config.pluginMetadatas.wine.enabled

  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-3 items-start">
        <FormField class="w-28" label={t('plugin.arch')}>
          <FormSelect
            onChange={(e: Event) => {
              props.onCommit({
                ...props.config,
                arch: (e.target as HTMLSelectElement).value as 'auto' | 'x64' | 'x86'
              })
            }}
            options={[
              { label: t('plugin.archAuto'), value: 'auto' },
              { label: 'x86', value: 'x86' },
              { label: 'x64', value: 'x64' }
            ]}
            value={props.config.arch}
          />
        </FormField>
      </div>
      <Show when={showWineRequired()}>
        <FieldHint text={t('plugin.wineRequired')} variant="warning" />
      </Show>
    </div>
  )
}

export const VOICE_ZEROINTERRUPT_PLUGIN: PluginDefinition<'voiceZerointerrupt'> = {
  configDefaults: { arch: 'auto' },
  GameEditor: VoiceZerointerruptGameConfigEditor,
  info: {
    author: 'lxl66566',
    descriptionKey: 'plugin.voiceZerointerrupt.description',
    id: 'voiceZerointerrupt',
    links: [
      {
        label: 'GitHub',
        url: 'https://github.com/lxl66566/AudioSpeedHack'
      }
    ],
    nameKey: 'plugin.voiceZerointerrupt.name',
    version: '1.3.1'
  },
  MetaEditor: AutoAddMetaEditor,
  metaKey: 'voiceZerointerrupt'
}

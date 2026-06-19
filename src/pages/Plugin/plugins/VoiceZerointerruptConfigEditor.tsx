/**
 * VoiceZerointerrupt plugin — self-contained definition file.
 */
import type { VoiceZerointerruptGameConfig } from '@bindings/VoiceZerointerruptGameConfig'
import { FieldHint } from '@components/ui/FieldHint'
import { FormField, FormSelect } from '@components/ui/form'
import { useI18n, type Dictionary } from '~/i18n'
import { useConfig } from '~/store'
import { isLinux } from '~/utils/platform'
import { Show } from 'solid-js/web'
import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

function VoiceZerointerruptGameConfigEditor(
  props: ConfigEditorProps<VoiceZerointerruptGameConfig>
) {
  const { t } = useI18n()
  const { config } = useConfig()

  const showWineRequired = () => isLinux && config.pluginMetadatas.wine?.enabled === false

  return (
    <div class="flex flex-col gap-2">
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
      <Show when={showWineRequired()}>
        <FieldHint
          variant="warning"
          text={String(t('plugin.wineRequired' as keyof Dictionary))}
        />
      </Show>
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
  MetaEditor: AutoAddMetaEditor,
  GameEditor: VoiceZerointerruptGameConfigEditor
}

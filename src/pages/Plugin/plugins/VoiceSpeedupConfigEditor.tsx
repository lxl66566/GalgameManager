/**
 * VoiceSpeedup plugin — self-contained definition file.
 */
import type { VoiceSpeedupGameConfig } from '@bindings/VoiceSpeedupGameConfig'
import { FieldHint } from '@components/ui/FieldHint'
import { FormField, FormInput, FormSelect } from '@components/ui/form'
import { Show } from 'solid-js'

import { useI18n } from '~/i18n'
import { useConfig } from '~/store'
import { isLinux } from '~/utils/platform'

import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

/** Parse a speed value from user input, clamped to [1.0, 2.0]. */
const parseSpeed = (raw: string): null | number => {
  // Allow intermediate states like "1.", ".5", "1.2"
  const value = Number.parseFloat(raw)
  if (Number.isNaN(value)) return null
  return Math.min(2, Math.max(1, value))
}

function VoiceSpeedupGameConfigEditor(props: ConfigEditorProps<VoiceSpeedupGameConfig>) {
  const { t } = useI18n()
  const { config } = useConfig()

  const showMmdevapiWarn = () => isLinux && props.config.provider === 'mmdevapi'
  const showWineRequired = () => isLinux && !config.pluginMetadatas.wine.enabled

  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-start gap-5">
        <FormField class="w-28" label={t('plugin.voiceSpeedup.speed')}>
          <FormInput
            class="w-full"
            inputmode="decimal"
            onBlur={(e: FocusEvent) => {
              // Normalize on blur: reformat to clean decimal
              const element = e.target as HTMLInputElement
              const parsed = parseSpeed(element.value)
              if (parsed === null) {
                // Reset to current config value if invalid
                element.value = String(props.config.speed)
              } else {
                element.value = String(parsed)
                props.onCommit({ ...props.config, speed: parsed })
              }
            }}
            type="text"
            value={String(props.config.speed)}
          />
        </FormField>
        <FormField class="w-28" label={t('plugin.voiceSpeedup.provider')}>
          <FormSelect
            class="w-full"
            onChange={(e: Event) => {
              props.onCommit({
                ...props.config,
                provider: (e.target as HTMLSelectElement).value as 'dsound' | 'mmdevapi'
              })
            }}
            options={[
              { label: 'MMDevAPI', value: 'mmdevapi' },
              { label: 'dsound', value: 'dsound' }
            ]}
            value={props.config.provider}
          />
        </FormField>
        <FormField class="w-28" label={t('plugin.arch')}>
          <FormSelect
            class="w-full"
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
      <Show when={showMmdevapiWarn()}>
        <FieldHint text={t('plugin.voiceSpeedup.mmdevapiWarn')} variant="warning" />
      </Show>
      <Show when={showWineRequired()}>
        <FieldHint text={t('plugin.wineRequired')} variant="warning" />
      </Show>
    </div>
  )
}

export const VOICE_SPEEDUP_PLUGIN: PluginDefinition<'voiceSpeedup'> = {
  configDefaults: { arch: 'auto', provider: 'mmdevapi', speed: 1.5 },
  GameEditor: VoiceSpeedupGameConfigEditor,
  info: {
    author: 'lxl66566',
    descriptionKey: 'plugin.voiceSpeedup.description',
    id: 'voiceSpeedup',
    links: [
      {
        label: 'GitHub',
        url: 'https://github.com/lxl66566/AudioSpeedHack'
      }
    ],
    nameKey: 'plugin.voiceSpeedup.name',
    version: '1.3.2'
  },
  MetaEditor: AutoAddMetaEditor,
  metaKey: 'voiceSpeedup'
}

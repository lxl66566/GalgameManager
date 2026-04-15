/**
 * VoiceSpeedup plugin — self-contained definition file.
 */
import type { VoiceSpeedupGameConfig } from '@bindings/VoiceSpeedupGameConfig'
import type { VoiceSpeedupPluginMeta } from '@bindings/VoiceSpeedupPluginMeta'
import { FormField } from '@components/ui/FormField'
import { FormInput } from '@components/ui/FormInput'
import { FormSelect } from '@components/ui/FormSelect'
import { FormSwitch } from '@components/ui/FormSwitch'
import { useI18n } from '~/i18n'
import type { ConfigEditorProps, PluginDefinition } from './types'

function VoiceSpeedupMetaEditor(props: ConfigEditorProps<VoiceSpeedupPluginMeta>) {
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

function VoiceSpeedupGameConfigEditor(props: ConfigEditorProps<VoiceSpeedupGameConfig>) {
  const { t } = useI18n()

  /** Parse a speed value from user input, clamped to [1.0, 2.0]. */
  const parseSpeed = (raw: string): number | null => {
    // Allow intermediate states like "1.", ".5", "1.2"
    const val = parseFloat(raw)
    if (isNaN(val)) return null
    return Math.min(2.0, Math.max(1.0, val))
  }

  return (
    <div class="flex flex-wrap gap-5 items-start">
      <FormField label={t('plugin.voiceSpeedup.speed')} class="w-28">
        <FormInput
          class="w-full"
          type="text"
          inputmode="decimal"
          value={String(props.config.speed)}
          onBlur={(e: FocusEvent) => {
            // Normalize on blur: reformat to clean decimal
            const el = e.target as HTMLInputElement
            const parsed = parseSpeed(el.value)
            if (parsed !== null) {
              el.value = String(parsed)
              props.onCommit({ ...props.config, speed: parsed })
            } else {
              // Reset to current config value if invalid
              el.value = String(props.config.speed)
            }
          }}
        />
      </FormField>
      <FormField label={t('plugin.voiceSpeedup.provider')} class="w-28">
        <FormSelect
          class="w-full"
          options={[
            { label: 'MMDevAPI', value: 'mmdevapi' },
            { label: 'dsound', value: 'dsound' }
          ]}
          value={props.config.provider}
          onChange={(e: Event) =>
            props.onCommit({
              ...props.config,
              provider: (e.target as HTMLSelectElement).value as 'mmdevapi' | 'dsound'
            })
          }
        />
      </FormField>
      <FormField label={t('plugin.arch')} class="w-28">
        <FormSelect
          class="w-full"
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

export const VOICE_SPEEDUP_PLUGIN: PluginDefinition<'voiceSpeedup'> = {
  info: {
    id: 'voiceSpeedup',
    nameKey: 'plugin.voiceSpeedup.name',
    descriptionKey: 'plugin.voiceSpeedup.description',
    version: '1.2.0',
    author: 'lxl66566',
    links: [
      {
        label: 'GitHub',
        url: 'https://github.com/lxl66566/AudioSpeedHack'
      }
    ]
  },
  metaKey: 'voiceSpeedup',
  configDefaults: { speed: 1.5, provider: 'mmdevapi', arch: 'auto' },
  MetaEditor: VoiceSpeedupMetaEditor,
  GameEditor: VoiceSpeedupGameConfigEditor
}

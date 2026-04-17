/**
 * LocaleEmulator plugin — self-contained definition file.
 *
 * A simplified wrapper around the GameWrapper plugin for Locale Emulator
 * integration. Only exposes the cmd field.
 */
import type { LocaleEmulatorGameConfig } from '@bindings/LocaleEmulatorGameConfig'
import type { LocaleEmulatorPluginMeta } from '@bindings/LocaleEmulatorPluginMeta'
import { FormField, FormInput, FormSwitch } from '@components/ui/form'
import { useI18n } from '~/i18n'
import type { ConfigEditorProps, PluginDefinition } from './types'

function LocaleEmulatorMetaEditor(props: ConfigEditorProps<LocaleEmulatorPluginMeta>) {
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

function LocaleEmulatorGameConfigEditor(
  props: ConfigEditorProps<LocaleEmulatorGameConfig>
) {
  const { t } = useI18n()

  const needsPlaceholder = () => !props.config.cmd.includes('{}')

  return (
    <div class="flex flex-wrap gap-4 items-start items-stretch">
      <FormField label={t('plugin.localeEmulator.cmd')} class="flex-1 min-w-48">
        <FormInput
          class="w-full"
          type="text"
          value={props.config.cmd}
          placeholder={t('plugin.localeEmulator.cmdPlaceholder')}
          checkVars
          warning={needsPlaceholder() ? t('plugin.needBraces') : undefined}
          onBlur={(e: FocusEvent) => {
            const val = (e.target as HTMLInputElement).value
            if (val !== props.config.cmd) {
              props.onCommit({ ...props.config, cmd: val })
            }
          }}
        />
      </FormField>
    </div>
  )
}

export const LOCALE_EMULATOR_PLUGIN: PluginDefinition<'localeEmulator'> = {
  info: {
    id: 'localeEmulator',
    nameKey: 'plugin.localeEmulator.name',
    descriptionKey: 'plugin.localeEmulator.description',
    version: '1.1.0',
    author: 'BUILTIN_WRAPPER',
    links: [
      {
        label: 'GitHub',
        url: 'https://github.com/xupefei/Locale-Emulator'
      }
    ]
  },
  metaKey: 'localeEmulator',
  configDefaults: {
    cmd: 'your_path/LEProc.exe "{}"'
  },
  MetaEditor: LocaleEmulatorMetaEditor,
  GameEditor: LocaleEmulatorGameConfigEditor
}

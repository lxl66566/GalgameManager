/**
 * LocaleEmulator plugin — self-contained definition file.
 *
 * A simplified wrapper around the GameWrapper plugin for Locale Emulator
 * integration. Only exposes the cmd field.
 */
import type { LocaleEmulatorGameConfig } from '@bindings/LocaleEmulatorGameConfig'
import { FormField, FormInput } from '@components/ui/form'
import { useI18n } from '~/i18n'
import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

function LocaleEmulatorGameConfigEditor(
  props: ConfigEditorProps<LocaleEmulatorGameConfig>
) {
  const { t } = useI18n()

  const needsPlaceholder = () => !props.config.cmd.includes('{}')

  return (
    <div class="flex flex-wrap gap-4 items-start items-stretch">
      <FormField class="flex-1 min-w-48" label={t('plugin.localeEmulator.cmd')}>
        <FormInput
          checkVars
          class="w-full"
          onBlur={(e: FocusEvent) => {
            const value = (e.target as HTMLInputElement).value
            if (value !== props.config.cmd) {
              props.onCommit({ ...props.config, cmd: value })
            }
          }}
          placeholder={t('plugin.localeEmulator.cmdPlaceholder')}
          type="text"
          value={props.config.cmd}
          warning={needsPlaceholder() ? t('plugin.needBraces') : undefined}
        />
      </FormField>
    </div>
  )
}

export const LOCALE_EMULATOR_PLUGIN: PluginDefinition<'localeEmulator'> = {
  configDefaults: {
    cmd: 'your_path/LEProc.exe "{}"'
  },
  GameEditor: LocaleEmulatorGameConfigEditor,
  info: {
    author: 'BUILTIN_WRAPPER',
    descriptionKey: 'plugin.localeEmulator.description',
    id: 'localeEmulator',
    links: [
      {
        label: 'GitHub',
        url: 'https://github.com/xupefei/Locale-Emulator'
      }
    ],
    nameKey: 'plugin.localeEmulator.name',
    platforms: ['windows'],
    version: '2.5.0.1'
  },
  MetaEditor: AutoAddMetaEditor,
  metaKey: 'localeEmulator'
}

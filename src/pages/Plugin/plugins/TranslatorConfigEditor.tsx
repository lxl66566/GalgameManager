/**
 * Translator plugin — self-contained definition file.
 *
 * A simplified wrapper around the Execute plugin for running translation
 * tools alongside the game. Only exposes cmd and currentDir fields.
 */
import type { TranslatorGameConfig } from '@bindings/TranslatorGameConfig'
import type { TranslatorPluginMeta } from '@bindings/TranslatorPluginMeta'
import { FormField, FormInput, FormPathInput, FormSwitch } from '@components/ui/form'
import { useI18n } from '~/i18n'
import type { ConfigEditorProps, PluginDefinition } from './types'

function TranslatorMetaEditor(props: ConfigEditorProps<TranslatorPluginMeta>) {
  const { t } = useI18n()
  return (
    <div class="flex flex-wrap gap-3 items-start">
      <FormField label={t('plugin.autoAdd')} class="w-auto">
        <FormSwitch
          checked={props.config.autoAdd}
          onChange={(checked: boolean) =>
            props.onChange({ ...props.config, autoAdd: checked })
          }
        />
      </FormField>
    </div>
  )
}

function TranslatorGameConfigEditor(props: ConfigEditorProps<TranslatorGameConfig>) {
  const { t } = useI18n()

  return (
    <div class="flex flex-wrap gap-4 items-start items-stretch">
      <FormField label={t('plugin.translator.cmd')} class="flex-1 min-w-48">
        <FormInput
          class="w-full"
          type="text"
          value={props.config.cmd}
          placeholder={t('plugin.translator.cmdPlaceholder')}
          onInput={(e: InputEvent) =>
            props.onChange({ ...props.config, cmd: (e.target as HTMLInputElement).value })
          }
        />
      </FormField>

      <FormField label={t('plugin.currentDir')} class="flex-1 min-w-48">
        <FormPathInput
          class="w-full"
          value={props.config.currentDir}
          onChange={v => props.onChange({ ...props.config, currentDir: v })}
          placeholder={t('plugin.currentDirPlaceholder')}
          isDir
        />
      </FormField>
    </div>
  )
}

export const TRANSLATOR_PLUGIN: PluginDefinition<'translator'> = {
  info: {
    id: 'translator',
    nameKey: 'plugin.translator.name',
    descriptionKey: 'plugin.translator.description',
    version: '1.0.0',
    author: 'BUILTIN_WRAPPER',
    links: [
      {
        label: 'LunaTranslator',
        url: 'https://github.com/HIllya51/LunaTranslator'
      }
    ]
  },
  metaKey: 'translator',
  configDefaults: {
    cmd: '',
    currentDir: ''
  },
  MetaEditor: TranslatorMetaEditor,
  GameEditor: TranslatorGameConfigEditor
}

/**
 * Translator plugin — self-contained definition file.
 *
 * A simplified wrapper around the Execute plugin for running translation
 * tools alongside the game. Only exposes cmd, currentDir, and exitSignal fields.
 */
import type { TranslatorGameConfig } from '@bindings/TranslatorGameConfig'
import type { TranslatorPluginMeta } from '@bindings/TranslatorPluginMeta'
import {
  FormField,
  FormInput,
  FormPathInput,
  FormSelect,
  FormSwitch
} from '@components/ui/form'
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
            props.onCommit({ ...props.config, autoAdd: checked })
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
          onBlur={(e: FocusEvent) => {
            const val = (e.target as HTMLInputElement).value
            if (val !== props.config.cmd) {
              props.onCommit({ ...props.config, cmd: val })
            }
          }}
        />
      </FormField>

      <FormField label={t('plugin.currentDir')} class="flex-1 min-w-48">
        <FormPathInput
          class="w-full"
          value={props.config.currentDir}
          onCommit={v => props.onCommit({ ...props.config, currentDir: v })}
          placeholder={t('plugin.currentDirPlaceholder')}
          isDir
        />
      </FormField>

      <FormField
        label={t('plugin.translator.onGameExit')}
        class="w-40"
        description={t('plugin.translator.onGameExitDesc')}
      >
        <FormSelect
          class="w-full"
          options={[
            { label: t('plugin.translator.exitNone'), value: 'none' },
            { label: t('plugin.translator.exitGraceful'), value: 'sigterm' }
          ]}
          value={props.config.exitSignal}
          onChange={(e: Event) =>
            props.onCommit({
              ...props.config,
              exitSignal: (e.target as HTMLSelectElement).value as 'none' | 'sigterm'
            })
          }
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
    version: '1.0.1',
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
    currentDir: '',
    exitSignal: 'sigterm'
  },
  MetaEditor: TranslatorMetaEditor,
  GameEditor: TranslatorGameConfigEditor
}

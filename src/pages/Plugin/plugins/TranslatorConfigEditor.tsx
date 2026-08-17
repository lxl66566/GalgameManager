/**
 * Translator plugin — self-contained definition file.
 *
 * A simplified wrapper around the Execute plugin for running translation
 * tools alongside the game. Only exposes cmd, currentDir, and exitSignal fields.
 */
import type { TranslatorGameConfig } from '@bindings/TranslatorGameConfig'
import { FormField, FormInput, FormPathInput, FormSelect } from '@components/ui/form'

import { useI18n } from '~/i18n'

import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

function TranslatorGameConfigEditor(props: ConfigEditorProps<TranslatorGameConfig>) {
  const { t } = useI18n()

  return (
    <div class="flex flex-wrap items-start items-stretch gap-4">
      <FormField class="min-w-48 flex-1" label={t('plugin.translator.cmd')}>
        <FormInput
          checkVars
          class="w-full"
          onBlur={(e: FocusEvent) => {
            const value = (e.target as HTMLInputElement).value
            if (value !== props.config.cmd) {
              props.onCommit({ ...props.config, cmd: value })
            }
          }}
          placeholder={t('plugin.translator.cmdPlaceholder')}
          type="text"
          value={props.config.cmd}
        />
      </FormField>

      <FormField class="min-w-48 flex-1" label={t('plugin.currentDir')}>
        <FormPathInput
          class="w-full"
          isDir
          onCommit={v => {
            props.onCommit({ ...props.config, currentDir: v })
          }}
          placeholder={t('plugin.currentDirPlaceholder')}
          value={props.config.currentDir}
        />
      </FormField>

      <FormField
        class="w-40"
        description={t('plugin.translator.onGameExitDesc')}
        label={t('plugin.translator.onGameExit')}
      >
        <FormSelect
          class="w-full"
          onChange={(e: Event) => {
            props.onCommit({
              ...props.config,
              exitSignal: (e.target as HTMLSelectElement).value as 'none' | 'sigterm'
            })
          }}
          options={[
            { label: t('plugin.translator.exitNone'), value: 'none' },
            { label: t('plugin.translator.exitGraceful'), value: 'sigterm' }
          ]}
          value={props.config.exitSignal}
        />
      </FormField>
    </div>
  )
}

export const TRANSLATOR_PLUGIN: PluginDefinition<'translator'> = {
  configDefaults: {
    cmd: '',
    currentDir: '',
    exitSignal: 'sigterm'
  },
  GameEditor: TranslatorGameConfigEditor,
  info: {
    author: 'BUILTIN_WRAPPER',
    descriptionKey: 'plugin.translator.description',
    id: 'translator',
    links: [
      {
        label: 'LunaTranslator',
        url: 'https://github.com/HIllya51/LunaTranslator'
      }
    ],
    nameKey: 'plugin.translator.name',
    version: '1.3.1'
  },
  MetaEditor: AutoAddMetaEditor,
  metaKey: 'translator'
}

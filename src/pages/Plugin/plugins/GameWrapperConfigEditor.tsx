/**
 * GameWrapper plugin — self-contained definition file.
 *
 * Replaces the game spawn command. Always substitutes `{}` with game exe path.
 */
import type { GameWrapperGameConfig } from '@bindings/GameWrapperGameConfig'
import type { GameWrapperPluginMeta } from '@bindings/GameWrapperPluginMeta'
import {
  FormField,
  FormInput,
  FormPathInput,
  FormSwitch,
  FormTableEditor
} from '@components/ui/form'
import { useI18n } from '~/i18n'
import { Show } from 'solid-js'
import type { ConfigEditorProps, PluginDefinition } from './types'

function GameWrapperMetaEditor(props: ConfigEditorProps<GameWrapperPluginMeta>) {
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

function GameWrapperGameConfigEditor(props: ConfigEditorProps<GameWrapperGameConfig>) {
  const { t } = useI18n()

  const needsPlaceholder = () => !props.config.cmd.includes('{}')

  return (
    <div class="flex flex-wrap gap-4 items-start items-stretch">
      <FormField
        label={t('plugin.gameWrapper.cmd')}
        class="flex-1 min-w-48"
        warning={needsPlaceholder() ? t('plugin.needBraces') : undefined}
      >
        <FormInput
          class="w-full"
          type="text"
          value={props.config.cmd}
          placeholder={t('plugin.gameWrapper.cmdPlaceholder')}
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

      <FormField label={t('plugin.gameWrapper.env')} class="w-full">
        <FormTableEditor
          values={props.config.env}
          onChange={v => props.onChange({ ...props.config, env: v })}
          addLabel={t('plugin.gameWrapper.addEnv')}
        />
      </FormField>
    </div>
  )
}

export const GAME_WRAPPER_PLUGIN: PluginDefinition<'gameWrapper'> = {
  info: {
    id: 'gameWrapper',
    nameKey: 'plugin.gameWrapper.name',
    descriptionKey: 'plugin.gameWrapper.description',
    version: '1.0.0',
    author: 'BUILTIN',
    links: []
  },
  metaKey: 'gameWrapper',
  configDefaults: {
    cmd: '',
    currentDir: '',
    env: {}
  },
  MetaEditor: GameWrapperMetaEditor,
  GameEditor: GameWrapperGameConfigEditor
}

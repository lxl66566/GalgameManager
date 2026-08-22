/**
 * GameWrapper plugin — self-contained definition file.
 *
 * Replaces the game spawn command. Always substitutes `{}` with game exe path.
 */
import type { GameWrapperGameConfig } from '@bindings/GameWrapperGameConfig'
import { FormField, FormInput, FormPathInput } from '@components/ui/form'
import { FormTableEditor } from '@components/ui/FormTableEditor'

import { useI18n } from '~/i18n'

import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

function GameWrapperGameConfigEditor(props: ConfigEditorProps<GameWrapperGameConfig>) {
  const { t } = useI18n()

  const needsPlaceholder = () => !props.config.cmd.includes('{}')

  return (
    <div class="flex flex-wrap items-start items-stretch gap-4">
      <FormField class="min-w-48 flex-1" label={t('plugin.gameWrapper.cmd')}>
        <FormInput
          checkVars
          class="w-full"
          onBlur={(e: FocusEvent) => {
            const value = (e.target as HTMLInputElement).value
            if (value !== props.config.cmd) {
              props.onCommit({ ...props.config, cmd: value })
            }
          }}
          placeholder={t('plugin.gameWrapper.cmdPlaceholder')}
          type="text"
          value={props.config.cmd}
          warning={needsPlaceholder() ? t('plugin.needBraces') : undefined}
        />
      </FormField>

      <FormField
        class="min-w-48 flex-1"
        description={t('plugin.currentDirDesc')}
        label={t('plugin.currentDir')}
      >
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

      <FormField class="w-full" label={t('plugin.gameWrapper.env')}>
        <FormTableEditor
          addLabel={t('plugin.gameWrapper.addEnv')}
          onCommit={v => {
            props.onCommit({ ...props.config, env: v })
          }}
          values={props.config.env}
        />
      </FormField>
    </div>
  )
}

export const GAME_WRAPPER_PLUGIN: PluginDefinition<'gameWrapper'> = {
  configDefaults: {
    cmd: '',
    currentDir: '',
    env: {}
  },
  GameEditor: GameWrapperGameConfigEditor,
  info: {
    author: 'BUILTIN',
    descriptionKey: 'plugin.gameWrapper.description',
    id: 'gameWrapper',
    links: [],
    nameKey: 'plugin.gameWrapper.name',
    version: '1.3.2'
  },
  MetaEditor: AutoAddMetaEditor,
  metaKey: 'gameWrapper'
}

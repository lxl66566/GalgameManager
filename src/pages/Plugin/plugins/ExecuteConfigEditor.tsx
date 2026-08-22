/**
 * Execute plugin — self-contained definition file.
 */
import type { ExecuteGameConfig } from '@bindings/ExecuteGameConfig'
import {
  FormField,
  FormInput,
  FormPathInput,
  FormSelect,
  FormSwitch
} from '@components/ui/form'
import { FormTableEditor } from '@components/ui/FormTableEditor'
import { createMemo } from 'solid-js'

import { useI18n } from '~/i18n'
import { isWindows } from '~/utils/platform'

import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

function ExecuteGameConfigEditor(props: ConfigEditorProps<ExecuteGameConfig>) {
  const { t } = useI18n()

  /** Show warning when passExePath is on but cmd lacks `{}`. */
  const needsPlaceholder = () =>
    props.config.passExePath && !props.config.cmd.includes('{}')

  /** Build platform-appropriate exit-signal options. */
  const exitSignalOptions = createMemo((): { label: string; value: string }[] => {
    if (isWindows) {
      return [
        { label: t('plugin.execute.exitSignalNone'), value: 'none' },
        { label: t('plugin.execute.exitSignalTerminate'), value: 'sigterm' }
      ]
    }
    return [
      { label: t('plugin.execute.exitSignalNone'), value: 'none' },
      { label: 'SIGTERM', value: 'sigterm' },
      { label: 'SIGKILL', value: 'sigkill' }
    ]
  })

  /** Resolve the effective value for the dropdown — on Windows, map sigkill → sigterm. */
  const effectiveExitSignal = createMemo(() =>
    isWindows && props.config.exitSignal === 'sigkill'
      ? ('sigterm' as const)
      : props.config.exitSignal
  )

  return (
    <div class="flex flex-wrap items-start items-stretch gap-4">
      <FormField class="w-40" label={t('plugin.execute.on')}>
        <FormSelect
          class="w-full"
          onChange={(e: Event) => {
            props.onCommit({
              ...props.config,
              on: (e.target as HTMLSelectElement).value as
                | 'afterGameStart'
                | 'beforeGameStart'
                | 'gameExit'
            })
          }}
          options={[
            {
              label: t('plugin.execute.beforeGameStart'),
              value: 'beforeGameStart'
            },
            {
              label: t('plugin.execute.afterGameStart'),
              value: 'afterGameStart'
            },
            { label: t('plugin.execute.gameExit'), value: 'gameExit' }
          ]}
          value={props.config.on}
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

      <FormField class="min-w-48 flex-1" label={t('plugin.execute.cmd')}>
        <FormInput
          checkVars
          class="w-full"
          onBlur={(e: FocusEvent) => {
            const value = (e.target as HTMLInputElement).value
            if (value !== props.config.cmd) {
              props.onCommit({ ...props.config, cmd: value })
            }
          }}
          placeholder={t('plugin.execute.cmdPlaceholder')}
          type="text"
          value={props.config.cmd}
          warning={needsPlaceholder() ? t('plugin.needBraces') : undefined}
        />
      </FormField>

      <FormField
        class="w-auto"
        description={t('plugin.execute.passExePathDesc')}
        label={t('plugin.execute.passExePath')}
      >
        <FormSwitch
          checked={props.config.passExePath}
          onChange={(checked: boolean) => {
            props.onCommit({ ...props.config, passExePath: checked })
          }}
        />
      </FormField>

      <FormField
        class="w-40"
        description={
          isWindows
            ? t('plugin.execute.exitSignalDescWin')
            : t('plugin.execute.exitSignalDesc')
        }
        label={t('plugin.execute.exitSignal')}
      >
        <FormSelect
          class="w-full"
          onChange={(e: Event) => {
            props.onCommit({
              ...props.config,
              exitSignal: (e.target as HTMLSelectElement).value as
                | 'none'
                | 'sigkill'
                | 'sigterm'
            })
          }}
          options={exitSignalOptions()}
          value={effectiveExitSignal()}
        />
      </FormField>

      <FormTableEditor
        addLabel={t('plugin.execute.addEnv')}
        label={t('plugin.execute.env')}
        labelClass="text-xs"
        onCommit={v => {
          props.onCommit({ ...props.config, env: v })
        }}
        values={props.config.env}
      />
    </div>
  )
}

export const EXECUTE_PLUGIN: PluginDefinition<'execute'> = {
  configDefaults: {
    cmd: '',
    currentDir: '',
    env: {},
    exitSignal: 'none',
    on: 'beforeGameStart',
    passExePath: false
  },
  GameEditor: ExecuteGameConfigEditor,
  info: {
    author: 'BUILTIN',
    descriptionKey: 'plugin.execute.description',
    id: 'execute',
    links: [],
    nameKey: 'plugin.execute.name',
    version: '1.3.2'
  },
  MetaEditor: AutoAddMetaEditor,
  metaKey: 'execute'
}

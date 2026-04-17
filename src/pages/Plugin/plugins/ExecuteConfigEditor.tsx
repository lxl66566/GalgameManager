/**
 * Execute plugin — self-contained definition file.
 */
import type { ExecuteGameConfig } from '@bindings/ExecuteGameConfig'
import type { ExecutePluginMeta } from '@bindings/ExecutePluginMeta'
import {
  FormField,
  FormInput,
  FormPathInput,
  FormSelect,
  FormSwitch
} from '@components/ui/form'
import { FormTableEditor } from '@components/ui/FormTableEditor'
import { useI18n } from '~/i18n'
import { isWindows } from '~/utils/platform'
import { createMemo } from 'solid-js'
import type { ConfigEditorProps, PluginDefinition } from './types'

function ExecuteMetaEditor(props: ConfigEditorProps<ExecutePluginMeta>) {
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

function ExecuteGameConfigEditor(props: ConfigEditorProps<ExecuteGameConfig>) {
  const { t } = useI18n()

  /** Show warning when passExePath is on but cmd lacks `{}`. */
  const needsPlaceholder = () =>
    props.config.passExePath && !props.config.cmd.includes('{}')

  /** Build platform-appropriate exit-signal options. */
  const exitSignalOptions = createMemo((): Array<{ label: string; value: string }> => {
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
    <div class="flex flex-wrap gap-4 items-start items-stretch">
      <FormField label={t('plugin.execute.on')} class="w-40">
        <FormSelect
          class="w-full"
          options={[
            { label: t('plugin.execute.beforeGameStart'), value: 'beforeGameStart' },
            { label: t('plugin.execute.afterGameStart'), value: 'afterGameStart' },
            { label: t('plugin.execute.gameExit'), value: 'gameExit' }
          ]}
          value={props.config.on}
          onChange={(e: Event) =>
            props.onCommit({
              ...props.config,
              on: (e.target as HTMLSelectElement).value as
                | 'beforeGameStart'
                | 'afterGameStart'
                | 'gameExit'
            })
          }
        />
      </FormField>

      <FormField
        label={t('plugin.currentDir')}
        description={t('plugin.currentDirDesc')}
        class="flex-1 min-w-48"
      >
        <FormPathInput
          class="w-full"
          value={props.config.currentDir}
          onCommit={v => props.onCommit({ ...props.config, currentDir: v })}
          placeholder={t('plugin.currentDirPlaceholder')}
          isDir
        />
      </FormField>

      <FormField label={t('plugin.execute.cmd')} class="flex-1 min-w-48">
        <FormInput
          class="w-full"
          type="text"
          value={props.config.cmd}
          placeholder={t('plugin.execute.cmdPlaceholder')}
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

      <FormField
        label={t('plugin.execute.passExePath')}
        description={t('plugin.execute.passExePathDesc')}
        class="w-auto"
      >
        <FormSwitch
          checked={props.config.passExePath}
          onChange={(checked: boolean) =>
            props.onCommit({ ...props.config, passExePath: checked })
          }
        />
      </FormField>

      <FormField
        label={t('plugin.execute.exitSignal')}
        class="w-40"
        description={
          isWindows
            ? t('plugin.execute.exitSignalDescWin')
            : t('plugin.execute.exitSignalDesc')
        }
      >
        <FormSelect
          class="w-full"
          options={exitSignalOptions()}
          value={effectiveExitSignal()}
          onChange={(e: Event) =>
            props.onCommit({
              ...props.config,
              exitSignal: (e.target as HTMLSelectElement).value as
                | 'none'
                | 'sigterm'
                | 'sigkill'
            })
          }
        />
      </FormField>

      <FormTableEditor
        label={t('plugin.execute.env')}
        labelClass="text-xs"
        values={props.config.env}
        onCommit={v => props.onCommit({ ...props.config, env: v })}
        addLabel={t('plugin.execute.addEnv')}
      />
    </div>
  )
}

export const EXECUTE_PLUGIN: PluginDefinition<'execute'> = {
  info: {
    id: 'execute',
    nameKey: 'plugin.execute.name',
    descriptionKey: 'plugin.execute.description',
    version: '1.0.1',
    author: 'BUILTIN',
    links: []
  },
  metaKey: 'execute',
  configDefaults: {
    on: 'beforeGameStart',
    cmd: '',
    passExePath: false,
    currentDir: '',
    env: {},
    exitSignal: 'none'
  },
  MetaEditor: ExecuteMetaEditor,
  GameEditor: ExecuteGameConfigEditor
}

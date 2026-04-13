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
  FormSwitch,
  FormTableEditor
} from '@components/ui/form'
import { useI18n } from '~/i18n'
import type { ConfigEditorProps, PluginDefinition } from './types'

function ExecuteMetaEditor(props: ConfigEditorProps<ExecutePluginMeta>) {
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

function ExecuteGameConfigEditor(props: ConfigEditorProps<ExecuteGameConfig>) {
  const { t } = useI18n()

  /** Show warning when passExePath is on but cmd lacks `{}`. */
  const needsPlaceholder = () =>
    props.config.passExePath && !props.config.cmd.includes('{}')

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
            props.onChange({
              ...props.config,
              on: (e.target as HTMLSelectElement).value as
                | 'beforeGameStart'
                | 'afterGameStart'
                | 'gameExit'
            })
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

      <FormField
        label={t('plugin.execute.cmd')}
        class="flex-1 min-w-48"
        warning={needsPlaceholder() ? t('plugin.needBraces') : undefined}
      >
        <FormInput
          class="w-full"
          type="text"
          value={props.config.cmd}
          placeholder={t('plugin.execute.cmdPlaceholder')}
          onInput={(e: InputEvent) =>
            props.onChange({ ...props.config, cmd: (e.target as HTMLInputElement).value })
          }
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
            props.onChange({ ...props.config, passExePath: checked })
          }
        />
      </FormField>

      <FormField
        label={t('plugin.execute.exitSignal')}
        class="w-40"
        description={t('plugin.execute.exitSignalDesc')}
      >
        <FormSelect
          class="w-full"
          options={[
            { label: t('plugin.execute.exitSignalNone'), value: 'none' },
            { label: 'SIGTERM', value: 'sigterm' },
            { label: 'SIGKILL', value: 'sigkill' }
          ]}
          value={props.config.exitSignal}
          onChange={(e: Event) =>
            props.onChange({
              ...props.config,
              exitSignal: (e.target as HTMLSelectElement).value as
                | 'none'
                | 'sigterm'
                | 'sigkill'
            })
          }
        />
      </FormField>

      <FormField label={t('plugin.execute.env')} class="w-full">
        <FormTableEditor
          values={props.config.env}
          onChange={v => props.onChange({ ...props.config, env: v })}
          addLabel={t('plugin.execute.addEnv')}
        />
      </FormField>
    </div>
  )
}

export const EXECUTE_PLUGIN: PluginDefinition<'execute'> = {
  info: {
    id: 'execute',
    nameKey: 'plugin.execute.name',
    descriptionKey: 'plugin.execute.description',
    version: '1.0.0',
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

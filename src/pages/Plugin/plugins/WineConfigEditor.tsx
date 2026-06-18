/**
 * Wine plugin — self-contained definition file.
 *
 * Launches Windows games through Wine on Linux. Translates the structured
 * config (prefix, arch, esync/fsync, dll overrides, locale, ...) into the
 * appropriate `WINE*` env vars on the Rust side.
 */
import type { DllOverride } from '@bindings/DllOverride'
import type { WineArch } from '@bindings/WineArch'
import type { WineGameConfig } from '@bindings/WineGameConfig'
import {
  FormField,
  FormInput,
  FormPathInput,
  FormSelect,
  FormSwitch
} from '@components/ui/form'
import { FormTableEditor } from '@components/ui/FormTableEditor'
import { useI18n } from '~/i18n'
import { type Component } from 'solid-js'
import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

/**
 * Options for the `dllOverrides` value column. Order matters: the first
 * entry (`disabled`) is what FormTableEditor picks when adding a new row,
 * matching Wine's "Disabled" semantics.
 */
const DLL_OVERRIDE_OPTIONS: { label: string; value: DllOverride }[] = [
  { label: 'disabled', value: 'disabled' },
  { label: 'native', value: 'native' },
  { label: 'builtin', value: 'builtin' },
  { label: 'native,builtin', value: 'nativeBuiltin' },
  { label: 'builtin,native', value: 'builtinNative' }
]

/**
 * Adapter that lets `FormTableEditor` (which is string-valued) edit the
 * `DllOverride` enum map. We cast at the boundary; the option list
 * guarantees only valid enum values are written back.
 */
const DllOverridesEditor: Component<ConfigEditorProps<WineGameConfig>> = props => {
  const { t } = useI18n()
  return (
    <FormTableEditor
      label={t('plugin.wine.dllOverrides')}
      labelClass="text-xs"
      description={t('plugin.wine.dllOverridesDesc')}
      addLabel={t('plugin.wine.addDllOverride')}
      values={props.config.dllOverrides as Record<string, string>}
      valueOptions={DLL_OVERRIDE_OPTIONS}
      onCommit={v =>
        props.onCommit({
          ...props.config,
          dllOverrides: v as Record<string, DllOverride>
        })
      }
    />
  )
}

function WineGameConfigEditor(props: ConfigEditorProps<WineGameConfig>) {
  const { t } = useI18n()

  return (
    <div class="flex flex-wrap gap-4 items-start items-stretch">
      <FormField
        label={t('plugin.wine.prefix')}
        description={t('plugin.wine.prefixDesc')}
        class="flex-1 min-w-48"
      >
        <FormPathInput
          class="w-full"
          value={props.config.prefix}
          onCommit={v => props.onCommit({ ...props.config, prefix: v })}
          placeholder={t('plugin.wine.prefixPlaceholder')}
          isDir
        />
      </FormField>

      <FormField
        label={t('plugin.wine.arch')}
        description={t('plugin.wine.archDesc')}
        class="w-28"
      >
        <FormSelect
          class="w-full"
          options={[
            { label: 'win64', value: 'win64' },
            { label: 'win32', value: 'win32' }
          ]}
          value={props.config.arch}
          onChange={(e: Event) =>
            props.onCommit({
              ...props.config,
              arch: (e.target as HTMLSelectElement).value as WineArch
            })
          }
        />
      </FormField>

      <FormField
        label={t('plugin.wine.locale')}
        description={t('plugin.wine.localeDesc')}
        class="flex-1 min-w-32"
      >
        <FormInput
          class="w-full"
          type="text"
          value={props.config.locale}
          placeholder={t('plugin.wine.localePlaceholder')}
          onBlur={(e: FocusEvent) => {
            const val = (e.target as HTMLInputElement).value
            if (val !== props.config.locale) {
              props.onCommit({ ...props.config, locale: val })
            }
          }}
        />
      </FormField>

      <FormField
        label={t('plugin.wine.esync')}
        description={t('plugin.wine.esyncDesc')}
        class="w-auto"
      >
        <FormSwitch
          checked={props.config.esync}
          onChange={(checked: boolean) =>
            props.onCommit({ ...props.config, esync: checked })
          }
        />
      </FormField>

      <FormField
        label={t('plugin.wine.fsync')}
        description={t('plugin.wine.fsyncDesc')}
        class="w-auto"
      >
        <FormSwitch
          checked={props.config.fsync}
          onChange={(checked: boolean) =>
            props.onCommit({ ...props.config, fsync: checked })
          }
        />
      </FormField>

      <FormField
        label={t('plugin.wine.killWineserver')}
        description={t('plugin.wine.killWineserverDesc')}
        class="w-auto"
      >
        <FormSwitch
          checked={props.config.killWineserverOnExit}
          onChange={(checked: boolean) =>
            props.onCommit({ ...props.config, killWineserverOnExit: checked })
          }
        />
      </FormField>

      <DllOverridesEditor config={props.config} onCommit={props.onCommit} />

      <FormTableEditor
        label={t('plugin.wine.extraEnv')}
        labelClass="text-xs"
        values={props.config.extraEnv}
        onCommit={v => props.onCommit({ ...props.config, extraEnv: v })}
        addLabel={t('plugin.wine.addEnv')}
      />
    </div>
  )
}

export const WINE_PLUGIN: PluginDefinition<'wine'> = {
  info: {
    id: 'wine',
    nameKey: 'plugin.wine.name',
    descriptionKey: 'plugin.wine.description',
    version: '1.0.0',
    author: 'BUILTIN',
    links: [{ label: 'WineHQ', url: 'https://www.winehq.org/' }],
    platforms: ['linux']
  },
  metaKey: 'wine',
  configDefaults: {
    prefix: '',
    arch: 'win64',
    esync: false,
    fsync: false,
    dllOverrides: {},
    locale: '',
    killWineserverOnExit: false,
    extraEnv: {}
  },
  MetaEditor: AutoAddMetaEditor,
  GameEditor: WineGameConfigEditor
}

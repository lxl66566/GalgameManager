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
import { type Component } from 'solid-js'

import { useI18n } from '~/i18n'

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
      addLabel={t('plugin.wine.addDllOverride')}
      description={t('plugin.wine.dllOverridesDesc')}
      label={t('plugin.wine.dllOverrides')}
      labelClass="text-xs"
      onCommit={v => {
        props.onCommit({
          ...props.config,
          dllOverrides: v as Record<string, DllOverride>
        })
      }}
      valueOptions={DLL_OVERRIDE_OPTIONS}
      values={props.config.dllOverrides}
    />
  )
}

function WineGameConfigEditor(props: ConfigEditorProps<WineGameConfig>) {
  const { t } = useI18n()

  return (
    <div class="flex flex-wrap items-start items-stretch gap-4">
      <FormField
        class="min-w-48 flex-1"
        description={t('plugin.wine.prefixDesc')}
        label={t('plugin.wine.prefix')}
      >
        <FormPathInput
          class="w-full"
          isDir
          onCommit={v => {
            props.onCommit({ ...props.config, prefix: v })
          }}
          placeholder={t('plugin.wine.prefixPlaceholder')}
          value={props.config.prefix}
        />
      </FormField>

      <FormField
        class="w-28"
        description={t('plugin.wine.archDesc')}
        label={t('plugin.wine.arch')}
      >
        <FormSelect
          class="w-full"
          onChange={(e: Event) => {
            props.onCommit({
              ...props.config,
              arch: (e.target as HTMLSelectElement).value as WineArch
            })
          }}
          options={[
            { label: 'win64', value: 'win64' },
            { label: 'win32', value: 'win32' }
          ]}
          value={props.config.arch}
        />
      </FormField>

      <FormField
        class="min-w-32 flex-1"
        description={t('plugin.wine.localeDesc')}
        label={t('plugin.wine.locale')}
      >
        <FormInput
          class="w-full"
          onBlur={(e: FocusEvent) => {
            const value = (e.target as HTMLInputElement).value
            if (value !== props.config.locale) {
              props.onCommit({ ...props.config, locale: value })
            }
          }}
          placeholder={t('plugin.wine.localePlaceholder')}
          type="text"
          value={props.config.locale}
        />
      </FormField>

      <FormField
        class="w-auto"
        description={t('plugin.wine.esyncDesc')}
        label={t('plugin.wine.esync')}
      >
        <FormSwitch
          checked={props.config.esync}
          onChange={(checked: boolean) => {
            props.onCommit({ ...props.config, esync: checked })
          }}
        />
      </FormField>

      <FormField
        class="w-auto"
        description={t('plugin.wine.fsyncDesc')}
        label={t('plugin.wine.fsync')}
      >
        <FormSwitch
          checked={props.config.fsync}
          onChange={(checked: boolean) => {
            props.onCommit({ ...props.config, fsync: checked })
          }}
        />
      </FormField>

      <FormField
        class="w-auto"
        description={t('plugin.wine.killWineserverDesc')}
        label={t('plugin.wine.killWineserver')}
      >
        <FormSwitch
          checked={props.config.killWineserverOnExit}
          onChange={(checked: boolean) => {
            props.onCommit({ ...props.config, killWineserverOnExit: checked })
          }}
        />
      </FormField>

      <DllOverridesEditor config={props.config} onCommit={props.onCommit} />

      <FormTableEditor
        addLabel={t('plugin.wine.addEnv')}
        label={t('plugin.wine.extraEnv')}
        labelClass="text-xs"
        onCommit={v => {
          props.onCommit({ ...props.config, extraEnv: v })
        }}
        values={props.config.extraEnv}
      />
    </div>
  )
}

export const WINE_PLUGIN: PluginDefinition<'wine'> = {
  configDefaults: {
    arch: 'win64',
    dllOverrides: {},
    esync: false,
    extraEnv: {},
    fsync: false,
    killWineserverOnExit: false,
    locale: '',
    prefix: ''
  },
  GameEditor: WineGameConfigEditor,
  info: {
    author: 'BUILTIN',
    descriptionKey: 'plugin.wine.description',
    id: 'wine',
    links: [{ label: 'WineHQ', url: 'https://www.winehq.org/' }],
    nameKey: 'plugin.wine.name',
    platforms: ['linux'],
    version: '1.3.1'
  },
  MetaEditor: AutoAddMetaEditor,
  metaKey: 'wine'
}

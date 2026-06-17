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
import { FormField, FormInput, FormPathInput, FormSelect, FormSwitch } from '@components/ui/form'
import { FormTableEditor } from '@components/ui/FormTableEditor'
import { useI18n } from '~/i18n'
import { FiPlusCircle, FiX } from 'solid-icons/fi'
import { For, Show, type Component } from 'solid-js'
import { AutoAddMetaEditor } from './AutoAddMetaEditor'
import type { ConfigEditorProps, PluginDefinition } from './types'

const DLL_OVERRIDE_OPTIONS: Array<{ label: string; value: DllOverride }> = [
  { label: 'disabled', value: 'disabled' },
  { label: 'native', value: 'native' },
  { label: 'builtin', value: 'builtin' },
  { label: 'native,builtin', value: 'nativeBuiltin' },
  { label: 'builtin,native', value: 'builtinNative' }
]

/** Inline editor for the `dllOverrides` map (dll name → override strategy). */
const DllOverridesEditor: Component<ConfigEditorProps<WineGameConfig>> = props => {
  const { t } = useI18n()
  const entries = () => Object.entries(props.config.dllOverrides).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  return (
    <FormField label={t('plugin.wine.dllOverrides')} class="w-full">
      <div class="flex flex-col gap-1 w-full">
        <For each={entries()}>
          {([dll, override]) => (
            <div class="flex items-center gap-1">
              <input
                type="text"
                value={dll}
                placeholder="DLL_NAME"
                onBlur={e => {
                  const newKey = e.currentTarget.value.trim()
                  if (newKey === dll || !newKey) return
                  const updated = { ...props.config.dllOverrides }
                  delete updated[dll]
                  updated[newKey] = override
                  props.onCommit({ ...props.config, dllOverrides: updated })
                }}
                class="flex-1 min-w-0 bg-transparent text-blue-600 dark:text-blue-300 font-mono text-[11px] px-1 py-0.5 rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:bg-gray-100 dark:focus:bg-gray-900 focus:border-blue-500 outline-none transition-all"
              />
              <select
                value={override}
                onChange={e => {
                  const updated = { ...props.config.dllOverrides }
                  updated[dll] = e.currentTarget.value as DllOverride
                  props.onCommit({ ...props.config, dllOverrides: updated })
                }}
                class="w-32 shrink-0 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-[11px] px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 focus:border-blue-500 outline-none"
              >
                <For each={DLL_OVERRIDE_OPTIONS}>
                  {opt => <option value={opt.value}>{opt.label}</option>}
                </For>
              </select>
              <button
                type="button"
                onClick={() => {
                  const updated = { ...props.config.dllOverrides }
                  delete updated[dll]
                  props.onCommit({ ...props.config, dllOverrides: updated })
                }}
                class="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-0.5 text-[11px] shrink-0"
              >
                <FiX class="w-3 h-3" />
              </button>
            </div>
          )}
        </For>
        <Show when={entries().length === 0}>
          <div class="text-gray-400 text-[11px] select-none py-1">{t('ui.none')}</div>
        </Show>
        <button
          type="button"
          onClick={() => {
            // Add with a placeholder key; user edits in place.
            let base = 'new_dll'
            let n = 1
            while (props.config.dllOverrides[base]) {
              base = `new_dll_${n++}`
            }
            props.onCommit({
              ...props.config,
              dllOverrides: { ...props.config.dllOverrides, [base]: 'native' }
            })
          }}
          class="flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer text-xs w-fit"
        >
          <FiPlusCircle class="w-4 h-4" />
          <span>{t('plugin.wine.addDllOverride')}</span>
        </button>
      </div>
    </FormField>
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

      <FormField label={t('plugin.wine.arch')} class="w-28">
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

      <FormField label={t('plugin.wine.locale')} class="flex-1 min-w-32">
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

      <FormField label={t('plugin.wine.esync')} class="w-auto">
        <FormSwitch
          checked={props.config.esync}
          onChange={(checked: boolean) => props.onCommit({ ...props.config, esync: checked })}
        />
      </FormField>

      <FormField label={t('plugin.wine.fsync')} class="w-auto">
        <FormSwitch
          checked={props.config.fsync}
          onChange={(checked: boolean) => props.onCommit({ ...props.config, fsync: checked })}
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

      <DllOverridesEditor
        config={props.config}
        onCommit={props.onCommit}
      />

      <FormField label={t('plugin.wine.extraEnv')} class="w-full">
        <FormTableEditor
          values={props.config.extraEnv}
          onCommit={v => props.onCommit({ ...props.config, extraEnv: v })}
          addLabel={t('plugin.wine.addEnv')}
        />
      </FormField>
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

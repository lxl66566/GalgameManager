/**
 * Plugin management page — data-driven rendering via typed helpers.
 */
import { SwitchToggle } from '@components/ui/settings'
import { openUrl } from '@tauri-apps/plugin-opener'
import { FiChevronDown, FiChevronUp, FiExternalLink } from 'solid-icons/fi'
import { createSignal, For, Show, type Component } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import { useI18n, type Dictionary } from '~/i18n'
import { useConfig } from '~/store'

import { PLUGIN_REGISTRY, type AnyPluginDef } from './plugins'
import {
  getPluginMeta,
  isPluginAvailable,
  type AnyGameConfig,
  type AnyMeta,
  type ConfigEditorProps
} from './plugins/types'
import { PLUGINS } from './registry'

export default function PluginPage() {
  const { t } = useI18n()
  const { actions, config } = useConfig()
  const [expandedId, setExpandedId] = createSignal<null | string>(null)

  const toggleExpand = (id: string) => {
    setExpandedId(previous => (previous === id ? null : id))
  }

  const isEnabled = (def: AnyPluginDef): boolean => {
    return getPluginMeta(def.metaKey, config.pluginMetadatas).enabled
  }

  const setEnabled = (def: AnyPluginDef, enabled: boolean) => {
    // Send only `{ pluginMetadatas: { <key>: { enabled: <bool> } } }` — a
    // single leaf flip rather than the whole `PluginMetadatas` snapshot.
    actions.updatePluginMetadatas({
      [def.metaKey]: { enabled }
    })
  }

  return (
    <div class="flex h-full w-full flex-col py-4 pl-4 pr-0">
      <div class="mb-4 flex flex-row items-center justify-between">
        <h1 class="text-2xl font-bold dark:text-white">{t('plugin.title')}</h1>
      </div>

      <div class="custom-scrollbar flex-1 overflow-y-auto pb-5 pr-4">
        <Show
          fallback={
            <div class="py-12 text-center text-gray-400 dark:text-gray-500">
              {t('plugin.noPlugins')}
            </div>
          }
          when={PLUGINS.length > 0}
        >
          <div class="space-y-3">
            <For each={PLUGIN_REGISTRY}>
              {def => {
                const isExpanded = () => expandedId() === def.info.id
                const meta = () => getPluginMeta(def.metaKey, config.pluginMetadatas)

                return (
                  <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-all dark:border-gray-700 dark:bg-gray-800">
                    <div
                      aria-expanded={isExpanded()}
                      class="flex cursor-pointer select-none items-center gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:hover:bg-gray-700/30"
                      onClick={() => {
                        toggleExpand(def.info.id)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleExpand(def.info.id)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {t(def.info.nameKey as keyof Dictionary) as string}
                          </span>
                          <span class="text-[10px] text-gray-400 dark:text-gray-500">
                            v{def.info.version}
                          </span>
                          <Show when={!isPluginAvailable(def.info)}>
                            <span class="select-none rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                              {t('plugin.unavailableOnPlatform')}
                            </span>
                          </Show>
                        </div>
                        <div class="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                          {t(def.info.descriptionKey as keyof Dictionary) as string}
                        </div>
                      </div>

                      <div
                        class="flex items-center gap-2"
                        onClick={e => {
                          e.stopPropagation()
                        }}
                      >
                        <span class="select-none text-[10px] text-gray-400 dark:text-gray-500">
                          {isEnabled(def) ? t('plugin.enabled') : t('plugin.disabled')}
                        </span>
                        <SwitchToggle
                          checked={isEnabled(def)}
                          onChange={(checked: boolean) => {
                            setEnabled(def, checked)
                          }}
                        />
                      </div>

                      <div class="text-gray-400 dark:text-gray-500">
                        <Show
                          fallback={<FiChevronDown class="h-4 w-4" />}
                          when={isExpanded()}
                        >
                          <FiChevronUp class="h-4 w-4" />
                        </Show>
                      </div>
                    </div>

                    <Show when={isExpanded()}>
                      <div class="space-y-4 border-t border-gray-200 bg-gray-50/30 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/20">
                        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <Show when={def.info.author}>
                            <span>
                              {t('plugin.author')}: {def.info.author}
                            </span>
                          </Show>
                          <Show when={def.info.links.length > 0}>
                            <div class="flex gap-2">
                              <For each={def.info.links}>
                                {link => (
                                  <a
                                    class="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                                    href={link.url}
                                    onClick={e => {
                                      e.preventDefault()
                                      void openUrl(link.url)
                                    }}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                  >
                                    {link.label}
                                    <FiExternalLink class="h-3 w-3" />
                                  </a>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>

                        <Show when={def.MetaEditor}>
                          <div>
                            <h4 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              {t('plugin.metaConfig')}
                            </h4>
                            <div class="overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                              <Dynamic
                                component={
                                  def.MetaEditor! as Component<ConfigEditorProps<AnyMeta>>
                                }
                                config={meta()}
                                onCommit={(m: Record<string, unknown>) => {
                                  // Persists to disk via a fine-grained
                                  // pluginMetadatas patch — only this plugin's
                                  // metadata touches the wire.
                                  actions.updatePluginMetadatas({
                                    [def.metaKey]: m
                                  })
                                }}
                              />
                            </div>
                          </div>
                        </Show>

                        <Show
                          when={def.GameEditor && 'configDefaults' in (meta() as object)}
                        >
                          <div>
                            <h4 class="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                              {t('plugin.defaultConfig')}
                            </h4>
                            <p class="mb-2 px-1 text-[10px] text-gray-400 dark:text-gray-500">
                              {t('plugin.defaultConfigDesc')}
                            </p>
                            <div class="overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                              <Dynamic
                                component={
                                  def.GameEditor! as Component<
                                    ConfigEditorProps<AnyGameConfig>
                                  >
                                }
                                config={
                                  (meta() as Record<string, unknown>)
                                    .configDefaults as AnyGameConfig
                                }
                                onCommit={(newDefaults: Record<string, unknown>) => {
                                  // Persists to disk via a fine-grained patch
                                  // — only this plugin's `configDefaults`
                                  // field is sent.
                                  actions.updatePluginMetadatas({
                                    [def.metaKey]: { configDefaults: newDefaults }
                                  })
                                }}
                              />
                            </div>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

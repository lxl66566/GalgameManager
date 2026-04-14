/**
 * Plugin management page — data-driven rendering via typed helpers.
 */
import { SwitchToggle } from '@components/ui/settings'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useI18n, type Dictionary } from '~/i18n'
import { useConfig } from '~/store'
import { FiChevronDown, FiChevronUp, FiExternalLink } from 'solid-icons/fi'
import { createSignal } from 'solid-js'
import { Dynamic, For, Show } from 'solid-js/web'
import { PLUGIN_REGISTRY, type AnyPluginDef } from './plugins'
import { getPluginMeta, patchPluginMeta, type PluginId } from './plugins/types'
import { PLUGINS } from './registry'

export default function PluginPage() {
  const { t } = useI18n()
  const { config, actions } = useConfig()
  const [expandedId, setExpandedId] = createSignal<string | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }

  const isEnabled = (def: AnyPluginDef): boolean => {
    return getPluginMeta(def.metaKey, config.pluginMetadatas)['enabled']
  }

  const setEnabled = (def: AnyPluginDef, enabled: boolean) => {
    actions.mutate(state => {
      state.pluginMetadatas = patchPluginMeta(def.metaKey, state.pluginMetadatas, {
        enabled
      })
    })
  }

  return (
    <div class="flex flex-col py-4 pl-4 pr-0 w-full h-full">
      <div class="flex flex-row justify-between items-center mb-4">
        <h1 class="text-2xl font-bold dark:text-white">{t('plugin.title')}</h1>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar pr-4 pb-5">
        <Show
          when={PLUGINS.length > 0}
          fallback={
            <div class="text-gray-400 dark:text-gray-500 text-center py-12">
              {t('plugin.noPlugins')}
            </div>
          }
        >
          <div class="space-y-3">
            <For each={PLUGIN_REGISTRY}>
              {def => {
                const isExpanded = () => expandedId() === def.info.id
                const meta = () => getPluginMeta(def.metaKey, config.pluginMetadatas)

                return (
                  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm transition-all">
                    <div
                      class="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      onClick={() => toggleExpand(def.info.id)}
                    >
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {String(t(def.info.nameKey as keyof Dictionary))}
                          </span>
                          <span class="text-[10px] text-gray-400 dark:text-gray-500">
                            v{def.info.version}
                          </span>
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                          {String(t(def.info.descriptionKey as keyof Dictionary))}
                        </div>
                      </div>

                      <div
                        class="flex items-center gap-2"
                        onClick={e => e.stopPropagation()}
                      >
                        <span class="text-[10px] text-gray-400 dark:text-gray-500 select-none">
                          {isEnabled(def) ? t('plugin.enabled') : t('plugin.disabled')}
                        </span>
                        <SwitchToggle
                          checked={isEnabled(def)}
                          onChange={(checked: boolean) => setEnabled(def, checked)}
                        />
                      </div>

                      <div class="text-gray-400 dark:text-gray-500">
                        <Show
                          when={isExpanded()}
                          fallback={<FiChevronDown class="w-4 h-4" />}
                        >
                          <FiChevronUp class="w-4 h-4" />
                        </Show>
                      </div>
                    </div>

                    <Show when={isExpanded()}>
                      <div class="border-t border-gray-200 dark:border-gray-700 px-5 py-4 space-y-4 bg-gray-50/30 dark:bg-gray-900/20">
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
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                                    onClick={e => {
                                      e.preventDefault()
                                      openUrl(link.url)
                                    }}
                                  >
                                    {link.label}
                                    <FiExternalLink class="w-3 h-3" />
                                  </a>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>

                        <Show when={def.MetaEditor}>
                          <div>
                            <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1 uppercase tracking-wider">
                              {t('plugin.metaConfig')}
                            </h4>
                            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm p-3">
                              <Dynamic
                                component={def.MetaEditor!}
                                config={meta()}
                                onCommit={(m: Record<string, unknown>) => {
                                  // Persists to disk: actions.mutate → save()
                                  actions.mutate(state => {
                                    state.pluginMetadatas = patchPluginMeta(
                                      def.metaKey as PluginId,
                                      state.pluginMetadatas,
                                      m as Parameters<typeof patchPluginMeta>[2]
                                    )
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
                            <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 px-1 uppercase tracking-wider">
                              {t('plugin.defaultConfig')}
                            </h4>
                            <p class="text-[10px] text-gray-400 dark:text-gray-500 mb-2 px-1">
                              {t('plugin.defaultConfigDesc')}
                            </p>
                            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm p-3">
                              <Dynamic
                                component={def.GameEditor!}
                                config={
                                  (meta() as Record<string, unknown>)[
                                    'configDefaults'
                                  ] as any
                                }
                                onCommit={(newDefaults: Record<string, unknown>) => {
                                  // Persists to disk: actions.mutate → save()
                                  actions.mutate(state => {
                                    state.pluginMetadatas = patchPluginMeta(
                                      def.metaKey as PluginId,
                                      state.pluginMetadatas,
                                      { configDefaults: newDefaults } as Parameters<
                                        typeof patchPluginMeta
                                      >[2]
                                    )
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

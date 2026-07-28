/**
 * PluginSection — Plugin management for a single game (in game edit modal).
 * Fully data-driven via typed helpers.
 */
import type { PluginInstance } from '@bindings/PluginInstance'
import type { PluginMetadatas } from '@bindings/PluginMetadatas'
import { useI18n, type Dictionary } from '~/i18n'
import { PLUGIN_REGISTRY, type AnyPluginDef } from '~/pages/Plugin/plugins'
import {
  buildNewInstance,
  type AnyGameConfig,
  type ConfigEditorProps
} from '~/pages/Plugin/plugins/types'
import { useConfig } from '~/store'
import {
  FiArrowDown,
  FiArrowUp,
  FiChevronDown,
  FiChevronUp,
  FiPlus,
  FiTrash2
} from 'solid-icons/fi'
import { createSignal, For, Show, type Component } from 'solid-js'
import { Dynamic } from 'solid-js/web'

interface PluginSectionProps {
  onChange: (plugins: PluginInstance[]) => void
  /**
   * Fine-grained store update that avoids replacing the array (keeps focus).
   * Receives the fully-typed updated instance so the consumer can do a
   * simple `setStore('plugins', index, updated)` without any casting.
   */
  onConfigChange?: (index: number, updated: PluginInstance) => void
  plugins: PluginInstance[]
}

/** Check whether a plugin type is enabled via its meta config. */
const isPluginEnabled = (metas: PluginMetadatas, pluginId: string): boolean => {
  const meta = metas[pluginId as keyof PluginMetadatas] as
    undefined | { enabled?: boolean }
  return meta?.enabled !== false
}

/** Walk up the DOM to find the nearest scrollable ancestor. */
const findScrollParent = (element: HTMLElement): HTMLElement | null => {
  let parent = element.parentElement
  while (parent) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }
  return null
}

/** Scroll the nearest scrollable ancestor so that `el` (plus extra for the dropdown) is visible. */
const scrollIntoViewLocal = (element: HTMLElement) => {
  const scrollParent = findScrollParent(element)
  if (!scrollParent) return
  const parentRect = scrollParent.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  // Reserve ~300px below the section for the dropdown menu
  const neededBottom = elementRect.top + 300
  if (neededBottom > parentRect.bottom) {
    scrollParent.scrollTop += neededBottom - parentRect.bottom + 8
  }
}

const getDef = (pluginId: string): AnyPluginDef | undefined =>
  PLUGIN_REGISTRY.find(d => d.info.id === pluginId)

/**
 * Reconstruct a PluginInstance with updated config.
 *
 * This is the only place that bridges the untyped `Record<string, unknown>`
 * from Dynamic editors back to the typed PluginInstance union. The spread
 * preserves the `pluginId` discriminant, so the assertion is safe.
 */
const withUpdatedConfig = (
  instance: PluginInstance,
  newConfig: Record<string, unknown>
): PluginInstance => ({ ...instance, config: newConfig }) as PluginInstance

export default function PluginSection(props: PluginSectionProps) {
  const { t } = useI18n()
  const { config } = useConfig()
  const [expandedIndex, setExpandedIndex] = createSignal<null | number>(null)
  const [showAddMenu, setShowAddMenu] = createSignal(false)
  let sectionRef: HTMLDivElement | undefined

  const handleAddPlugin = (def: AnyPluginDef) => {
    const newInstance = buildNewInstance(def, config.pluginMetadatas)
    props.onChange([...props.plugins, newInstance])
    setShowAddMenu(false)
    setExpandedIndex(props.plugins.length)
  }

  const handleRemovePlugin = (index: number) => {
    const newPlugins = [...props.plugins]
    newPlugins.splice(index, 1)
    props.onChange(newPlugins)
    if (expandedIndex() === index) setExpandedIndex(null)
    else if (expandedIndex() !== null && expandedIndex()! > index) {
      setExpandedIndex(expandedIndex()! - 1)
    }
  }

  const handleMovePlugin = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= props.plugins.length) return
    const newPlugins = [...props.plugins]
    const a = newPlugins[index]
    const b = newPlugins[newIndex]
    // Both indices are validated above, but noUncheckedIndexedAccess keeps
    // array access nullable — bail if the (impossible) null slipped through.
    if (!a || !b) return
    newPlugins[index] = b
    newPlugins[newIndex] = a
    props.onChange(newPlugins)
    if (expandedIndex() === index) setExpandedIndex(newIndex)
    else if (expandedIndex() === newIndex) setExpandedIndex(index)
  }

  const handleUpdateConfig = (index: number, newConfig: Record<string, unknown>) => {
    // Prefer fine-grained store update to avoid replacing the entire array,
    // which would cause <For> to re-create DOM elements and lose input focus.
    const current = props.plugins[index]
    if (!current) return
    const updated = withUpdatedConfig(current, newConfig)
    if (props.onConfigChange) {
      props.onConfigChange(index, updated)
    } else {
      const newPlugins = [...props.plugins]
      newPlugins[index] = updated
      props.onChange(newPlugins)
    }
  }

  const getPluginName = (instance: PluginInstance): string => {
    const def = getDef(instance.pluginId)
    // nameKey is contractually a leaf string key; `as keyof Dictionary`
    // widens t()'s return to include intermediate object nodes, so narrow
    // back to string (avoids "[object Object]" from a blind String() call).
    return def ? (t(def.info.nameKey as keyof Dictionary) as string) : instance.pluginId
  }

  return (
    <div class="flex flex-col gap-2 w-full" ref={sectionRef}>
      <div class="flex justify-between items-center">
        <span class="text-sm font-bold text-gray-700 dark:text-gray-300">
          {t('plugin.pluginSection')}
        </span>
        <div class="relative">
          <button
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer 
         flex items-center gap-1"
            onClick={() => {
              const isOpening = !showAddMenu()
              setShowAddMenu(isOpening)
              if (isOpening && sectionRef) scrollIntoViewLocal(sectionRef)
            }}
            title={t('plugin.addPlugin')}
            type="button"
          >
            <FiPlus class="w-4 h-4" />
            <span class="text-xs leading-none">{t('plugin.addPlugin')}</span>
          </button>
          <Show when={showAddMenu()}>
            <div class="absolute right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-10 min-w-[160px] overflow-hidden">
              <For
                each={PLUGIN_REGISTRY.filter(def =>
                  isPluginEnabled(config.pluginMetadatas, def.info.id)
                )}
              >
                {def => (
                  <button
                    class="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
                    onClick={() => {
                      handleAddPlugin(def)
                    }}
                    type="button"
                  >
                    {t(def.info.nameKey as keyof Dictionary) as string}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <div class="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 p-2 min-h-[60px] max-h-[400px] overflow-y-auto flex flex-col gap-1.5">
        <Show
          fallback={
            <div class="text-gray-400 dark:text-gray-500 text-xs select-none py-3 text-center">
              {t('plugin.noPluginsAdded')}
            </div>
          }
          when={props.plugins.length > 0}
        >
          <For each={props.plugins}>
            {(instance, index) => {
              const isExpanded = () => expandedIndex() === index()
              const isFirst = () => index() === 0
              const isLast = () => index() === props.plugins.length - 1
              const def = () => getDef(instance.pluginId)
              const enabled = () =>
                isPluginEnabled(config.pluginMetadatas, instance.pluginId)

              return (
                <div class="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-transparent rounded overflow-hidden transition-colors">
                  <div class="flex items-center gap-2 px-2 py-1.5">
                    <button
                      class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      disabled={isFirst()}
                      onClick={() => {
                        handleMovePlugin(index(), -1)
                      }}
                      title={t('plugin.moveUp')}
                      type="button"
                    >
                      <FiArrowUp class="w-3 h-3" />
                    </button>
                    <button
                      class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      disabled={isLast()}
                      onClick={() => {
                        handleMovePlugin(index(), 1)
                      }}
                      title={t('plugin.moveDown')}
                      type="button"
                    >
                      <FiArrowDown class="w-3 h-3" />
                    </button>

                    <span
                      class={`flex-1 text-xs font-medium cursor-pointer select-none truncate ${
                        enabled()
                          ? 'text-gray-700 dark:text-gray-200'
                          : 'text-gray-400 dark:text-gray-500 line-through'
                      }`}
                      onClick={() => setExpandedIndex(isExpanded() ? null : index())}
                      title={enabled() ? undefined : t('plugin.disabled')}
                    >
                      {getPluginName(instance)}
                    </span>

                    <button
                      class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      onClick={() => setExpandedIndex(isExpanded() ? null : index())}
                      type="button"
                    >
                      <Show
                        fallback={<FiChevronDown class="w-3 h-3" />}
                        when={isExpanded()}
                      >
                        <FiChevronUp class="w-3 h-3" />
                      </Show>
                    </button>

                    <button
                      class="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      onClick={() => {
                        handleRemovePlugin(index())
                      }}
                      title={t('plugin.removePlugin')}
                      type="button"
                    >
                      <FiTrash2 class="w-3 h-3" />
                    </button>
                  </div>

                  <Show when={isExpanded()}>
                    <Show
                      fallback={
                        // No editor for this plugin type (e.g. AutoUpload).
                        // Without this branch the chevron flips but nothing
                        // appears, which looks like the click was a no-op.
                        <div class="border-t border-gray-200 dark:border-gray-600/50 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/20 text-xs text-gray-400 dark:text-gray-500 italic">
                          {t('plugin.configEmpty')}
                        </div>
                      }
                      when={def()?.GameEditor && 'config' in instance}
                    >
                      {(() => {
                        // Plugin has a per-game editor → render it.
                        const d = def()!
                        // The editor varies per plugin, but at this dispatch
                        // point we only know the config is *some* game
                        // config. Cast the component to a union-aware editor
                        // instead of falling back to `any`, so the config
                        // stays typed.
                        const Editor = d.GameEditor as Component<
                          ConfigEditorProps<AnyGameConfig>
                        >
                        const gameConfig = (instance as { config: AnyGameConfig }).config
                        return (
                          <div class="border-t border-gray-200 dark:border-gray-600/50 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/20">
                            <Dynamic
                              component={Editor}
                              config={gameConfig}
                              onCommit={(values: Record<string, unknown>) => {
                                handleUpdateConfig(index(), values)
                              }}
                            />
                          </div>
                        )
                      })()}
                    </Show>
                  </Show>
                </div>
              )
            }}
          </For>
        </Show>
      </div>
    </div>
  )
}

/**
 * PluginSection — Plugin management for a single game (in game edit modal).
 * Fully data-driven via typed helpers, with drag-to-reorder support.
 */
import type { PluginInstance } from '@bindings/PluginInstance'
import type { PluginMetadatas } from '@bindings/PluginMetadatas'
import {
  closestCenter,
  createSortable,
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  type DragEvent as DndDragEvent
} from '@thisbeyond/solid-dnd'
import { useI18n, type Dictionary } from '~/i18n'
import { PLUGIN_REGISTRY, type AnyPluginDef } from '~/pages/Plugin/plugins'
import { buildNewInstance } from '~/pages/Plugin/plugins/types'
import { useConfig } from '~/store'
import { CgLayoutGridSmall, CgMenuGridO } from 'solid-icons/cg'
import { FiChevronDown, FiChevronUp, FiPlus, FiTrash2 } from 'solid-icons/fi'
import { createSignal, Index, Show } from 'solid-js'
import { Dynamic, For } from 'solid-js/web'

interface PluginSectionProps {
  plugins: PluginInstance[]
  onChange: (plugins: PluginInstance[]) => void
  /**
   * Fine-grained store update that avoids replacing the array (keeps focus).
   * Receives the fully-typed updated instance so the consumer can do a
   * simple `setStore('plugins', index, updated)` without any casting.
   */
  onConfigChange?: (index: number, updated: PluginInstance) => void
}

/** Check whether a plugin type is enabled via its meta config. */
const isPluginEnabled = (metas: PluginMetadatas, pluginId: string): boolean => {
  const meta = metas[pluginId as keyof PluginMetadatas] as
    | { enabled?: boolean }
    | undefined
  return meta?.enabled !== false
}

/** Walk up the DOM to find the nearest scrollable ancestor. */
const findScrollParent = (el: HTMLElement): HTMLElement | null => {
  let parent = el.parentElement
  while (parent) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }
  return null
}

/** Scroll the nearest scrollable ancestor so that `el` (plus extra for the dropdown) is visible. */
const scrollIntoViewLocal = (el: HTMLElement) => {
  const scrollParent = findScrollParent(el)
  if (!scrollParent) return
  const parentRect = scrollParent.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  // Reserve ~300px below the section for the dropdown menu
  const neededBottom = elRect.top + 300
  if (neededBottom > parentRect.bottom) {
    scrollParent.scrollTop += neededBottom - parentRect.bottom + 8
  }
}

export default function PluginSection(props: PluginSectionProps) {
  const { t } = useI18n()
  const { config } = useConfig()
  const [expandedIndex, setExpandedIndex] = createSignal<number | null>(null)
  const [showAddMenu, setShowAddMenu] = createSignal(false)
  let sectionRef: HTMLDivElement | undefined

  const getDef = (pluginId: string): AnyPluginDef | undefined =>
    PLUGIN_REGISTRY.find(d => d.info.id === pluginId)

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

  const handleUpdateConfig = (index: number, newConfig: Record<string, unknown>) => {
    // Prefer fine-grained store update to avoid replacing the entire array,
    // which would cause <Index> to re-create DOM elements and lose input focus.
    const updated = withUpdatedConfig(props.plugins[index], newConfig)
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
    return def ? String(t(def.info.nameKey as keyof Dictionary)) : instance.pluginId
  }

  // --- Drag-and-drop reorder ---
  const sortableIds = () => props.plugins.map((_, i) => `${i}`)

  const handleDragEnd = ({ draggable, droppable }: DndDragEvent) => {
    if (!draggable || !droppable) return
    const fromIndex = parseInt(String(draggable.id))
    const toIndex = parseInt(String(droppable.id))
    if (fromIndex === toIndex) return

    const newPlugins = [...props.plugins]
    const [moved] = newPlugins.splice(fromIndex, 1)
    newPlugins.splice(toIndex, 0, moved)
    props.onChange(newPlugins)
  }

  return (
    <div ref={sectionRef} class="flex flex-col gap-2 w-full">
      <div class="flex justify-between items-center">
        <span class="text-sm font-bold text-gray-700 dark:text-gray-300">
          {t('plugin.pluginSection')}
        </span>
        <div class="relative">
          <button
            onClick={() => {
              const opening = !showAddMenu()
              setShowAddMenu(opening)
              if (opening && sectionRef) scrollIntoViewLocal(sectionRef)
            }}
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer flex items-center gap-1"
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
                    onClick={() => handleAddPlugin(def)}
                    type="button"
                  >
                    {String(t(def.info.nameKey as keyof Dictionary))}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      <div class="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 p-2 min-h-[60px] max-h-[400px] overflow-y-auto flex flex-col gap-1.5">
        <Show
          when={props.plugins.length > 0}
          fallback={
            <div class="text-gray-400 dark:text-gray-500 text-xs select-none py-3 text-center">
              {t('plugin.noPluginsAdded')}
            </div>
          }
        >
          <DragDropProvider
            onDragEnd={handleDragEnd}
            collisionDetector={closestCenter}
          >
            <DragDropSensors />
            <SortableProvider ids={sortableIds()}>
              <Index each={props.plugins}>
                {(item, index) => {
                  const sortable = createSortable(index.toString())
                  const isExpanded = () => expandedIndex() === index
                  const def = () => getDef(item().pluginId)
                  const enabled = () =>
                    isPluginEnabled(config.pluginMetadatas, item().pluginId)

                  return (
                    <div
                      ref={sortable}
                      class={`bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-transparent rounded overflow-hidden transition-colors ${
                        sortable.isActiveDraggable
                          ? 'opacity-50 shadow-lg z-10 relative'
                          : ''
                      }`}
                    >
                      <div class="flex items-center gap-2 px-2 py-1.5">
                        {/* Drag handle */}
                        <button
                          class="text-gray-300 dark:text-gray-500 hover:text-gray-400 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing transition-colors"
                          {...sortable.dragActivators}
                          type="button"
                        >
                          <CgMenuGridO />
                        </button>

                        <span
                          class={`flex-1 text-xs font-medium cursor-pointer select-none truncate ${
                            enabled()
                              ? 'text-gray-700 dark:text-gray-200'
                              : 'text-gray-400 dark:text-gray-500 line-through'
                          }`}
                          onClick={() => setExpandedIndex(isExpanded() ? null : index)}
                          title={enabled() ? undefined : t('plugin.disabled')}
                        >
                          {getPluginName(item())}
                        </span>

                        <button
                          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          onClick={() => setExpandedIndex(isExpanded() ? null : index)}
                          type="button"
                        >
                          <Show
                            when={isExpanded()}
                            fallback={<FiChevronDown class="w-3 h-3" />}
                          >
                            <FiChevronUp class="w-3 h-3" />
                          </Show>
                        </button>

                        <button
                          class="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          onClick={() => handleRemovePlugin(index)}
                          title={t('plugin.removePlugin')}
                          type="button"
                        >
                          <FiTrash2 class="w-3 h-3" />
                        </button>
                      </div>

                      <Show
                        when={isExpanded() && def()?.GameEditor && 'config' in item()}
                      >
                        {(() => {
                          const d = def()
                          if (!d?.GameEditor) return null
                          return (
                            <div class="border-t border-gray-200 dark:border-gray-600/50 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/20">
                              <Dynamic
                                component={d.GameEditor}
                                config={
                                  (
                                    item() as {
                                      pluginId: string
                                      config: Record<string, unknown>
                                    }
                                  ).config as any
                                }
                                onCommit={(values: Record<string, unknown>) =>
                                  handleUpdateConfig(index, values)
                                }
                              />
                            </div>
                          )
                        })()}
                      </Show>
                    </div>
                  )
                }}
              </Index>
            </SortableProvider>
          </DragDropProvider>
        </Show>
      </div>
    </div>
  )
}

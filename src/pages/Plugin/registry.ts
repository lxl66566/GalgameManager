import { PLUGIN_REGISTRY, type AnyPluginDef, type PluginInfo } from './plugins'

export const PLUGINS: readonly PluginInfo[] = PLUGIN_REGISTRY.map(d => d.info)

export function getPluginDef(id: string): AnyPluginDef | undefined {
  return PLUGIN_REGISTRY.find(p => p.info.id === id)
}

import { PLUGIN_REGISTRY, type AnyPluginDef } from './plugins'

export function getPluginDef(id: string): AnyPluginDef | undefined {
  return PLUGIN_REGISTRY.find(p => p.info.id === id)
}

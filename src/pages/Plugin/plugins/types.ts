/**
 * Shared types for the plugin system.
 *
 * `PluginTypeMap` establishes the compile-time mapping from plugin ID to its
 * config types. All helpers are generic over `K extends PluginId`, so
 * callers get full type inference without `unknown`.
 */
import type { AutoUploadPluginMeta } from '@bindings/AutoUploadPluginMeta'
import type { ExecuteGameConfig } from '@bindings/ExecuteGameConfig'
import type { ExecutePluginMeta } from '@bindings/ExecutePluginMeta'
import type { GameWrapperGameConfig } from '@bindings/GameWrapperGameConfig'
import type { GameWrapperPluginMeta } from '@bindings/GameWrapperPluginMeta'
import type { LocaleEmulatorGameConfig } from '@bindings/LocaleEmulatorGameConfig'
import type { LocaleEmulatorPluginMeta } from '@bindings/LocaleEmulatorPluginMeta'
import type { PluginInstance } from '@bindings/PluginInstance'
import type { PluginMetadatas } from '@bindings/PluginMetadatas'
import type { TranslatorGameConfig } from '@bindings/TranslatorGameConfig'
import type { TranslatorPluginMeta } from '@bindings/TranslatorPluginMeta'
import type { VoiceSpeedupGameConfig } from '@bindings/VoiceSpeedupGameConfig'
import type { VoiceSpeedupPluginMeta } from '@bindings/VoiceSpeedupPluginMeta'
import type { VoiceZerointerruptGameConfig } from '@bindings/VoiceZerointerruptGameConfig'
import type { VoiceZerointerruptPluginMeta } from '@bindings/VoiceZerointerruptPluginMeta'
import type { Component } from 'solid-js'

// ── Plugin info (presentation metadata, frontend-only) ────────────────────────

export interface PluginInfo {
  id: string
  nameKey: string
  descriptionKey: string
  version: string
  author: string
  links: ReadonlyArray<{ label: string; url: string }>
}

// ── Config editor component props ────────────────────────────────────────────

export interface ConfigEditorProps<T> {
  config: T
  onChange: (config: T) => void
}

// ── Type-level plugin mapping ────────────────────────────────────────────────

/**
 * Maps each metaKey (= field name in PluginMetadatas) to its types.
 * When adding a new plugin, add an entry here.
 */
export interface PluginTypeMap {
  execute: { meta: ExecutePluginMeta; gameConfig: ExecuteGameConfig }
  autoUpload: { meta: AutoUploadPluginMeta; gameConfig: undefined }
  voiceSpeedup: { meta: VoiceSpeedupPluginMeta; gameConfig: VoiceSpeedupGameConfig }
  voiceZerointerrupt: {
    meta: VoiceZerointerruptPluginMeta
    gameConfig: VoiceZerointerruptGameConfig
  }
  gameWrapper: { meta: GameWrapperPluginMeta; gameConfig: GameWrapperGameConfig }
  localeEmulator: { meta: LocaleEmulatorPluginMeta; gameConfig: LocaleEmulatorGameConfig }
  translator: { meta: TranslatorPluginMeta; gameConfig: TranslatorGameConfig }
}

export type PluginId = keyof PluginTypeMap
export type PluginMetaOf<K extends PluginId> = PluginTypeMap[K]['meta']
export type PluginGameConfigOf<K extends PluginId> = PluginTypeMap[K]['gameConfig']

// ── Plugin definition ────────────────────────────────────────────────────────

export interface PluginDefinition<K extends PluginId> {
  info: PluginInfo
  metaKey: K
  configDefaults?: PluginGameConfigOf<K>
  MetaEditor?: Component<ConfigEditorProps<PluginMetaOf<K>>>
  GameEditor?: Component<ConfigEditorProps<NonNullable<PluginGameConfigOf<K>>>>
}

export type AnyPluginDef = { [K in PluginId]: PluginDefinition<K> }[PluginId]

// ── Typed helpers ────────────────────────────────────────────────────────────

export function getPluginMeta<K extends PluginId>(
  key: K,
  metas: PluginMetadatas
): PluginMetaOf<K> {
  return metas[key] as PluginMetaOf<K>
}

export function patchPluginMeta<K extends PluginId>(
  key: K,
  metas: PluginMetadatas,
  patch: Partial<PluginMetaOf<K>>
): PluginMetadatas {
  return { ...metas, [key]: { ...metas[key], ...patch } } as PluginMetadatas
}

export function buildNewInstance(
  def: AnyPluginDef,
  metas: PluginMetadatas
): PluginInstance {
  const gameConfig = resolveGameConfig(def, metas)
  if (gameConfig !== undefined) {
    return { pluginId: def.metaKey, config: gameConfig } as PluginInstance
  }
  return { pluginId: def.metaKey } as PluginInstance
}

export function resolveGameConfig(def: AnyPluginDef, metas: PluginMetadatas): unknown {
  const meta = metas[def.metaKey] as Record<string, unknown>
  const userDefaults = meta['configDefaults'] as Record<string, unknown> | undefined
  if (userDefaults && Object.keys(userDefaults).length > 0) {
    return { ...userDefaults }
  }
  return def.configDefaults ? { ...(def.configDefaults as object) } : undefined
}

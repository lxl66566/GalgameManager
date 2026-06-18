/**
 * Shared types for the plugin system.
 *
 * `PluginTypeMap` establishes the compile-time mapping from plugin ID to its
 * config types. All helpers are generic over `K extends PluginId`, so
 * callers get full type inference without `unknown`.
 */
import type { AutoUploadGameConfig } from '@bindings/AutoUploadGameConfig'
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
import type { WineGameConfig } from '@bindings/WineGameConfig'
import type { WinePluginMeta } from '@bindings/WinePluginMeta'
import { isLinux, isWindows } from '~/utils/platform'
import type { Component } from 'solid-js'

// ── Plugin info (presentation metadata, frontend-only) ────────────────────────

/** Platforms on which a plugin's handler has a real (non no-op) effect. */
export type PluginPlatform = 'windows' | 'linux'

export interface PluginInfo {
  id: string
  nameKey: string
  descriptionKey: string
  version: string
  author: string
  links: ReadonlyArray<{ label: string; url: string }>
  /**
   * Platforms where the plugin has a real effect. When omitted the plugin
   * works everywhere. Used to show an "unavailable on this platform" hint.
   */
  platforms?: ReadonlyArray<PluginPlatform>
}

// ── Config editor component props ────────────────────────────────────────────

export interface ConfigEditorProps<T> {
  config: T
  /**
   * Commit callback — called when the user finishes editing a field.
   *
   * For text fields this fires on blur; for discrete controls (select, switch)
   * it fires immediately on change.
   *
   * ⚠️ In the Plugin page context this writes to disk; in the Game edit modal
   * it only updates a local in-memory store.
   */
  onCommit: (config: T) => void
}

// ── Type-level plugin mapping ────────────────────────────────────────────────

/**
 * Maps each metaKey (= field name in PluginMetadatas) to its types.
 * When adding a new plugin, add an entry here.
 */
export interface PluginTypeMap {
  execute: { meta: ExecutePluginMeta; gameConfig: ExecuteGameConfig }
  autoUpload: { meta: AutoUploadPluginMeta; gameConfig: AutoUploadGameConfig }
  voiceSpeedup: { meta: VoiceSpeedupPluginMeta; gameConfig: VoiceSpeedupGameConfig }
  voiceZerointerrupt: {
    meta: VoiceZerointerruptPluginMeta
    gameConfig: VoiceZerointerruptGameConfig
  }
  gameWrapper: { meta: GameWrapperPluginMeta; gameConfig: GameWrapperGameConfig }
  localeEmulator: { meta: LocaleEmulatorPluginMeta; gameConfig: LocaleEmulatorGameConfig }
  translator: { meta: TranslatorPluginMeta; gameConfig: TranslatorGameConfig }
  wine: { meta: WinePluginMeta; gameConfig: WineGameConfig }
}

export type PluginId = keyof PluginTypeMap
export type PluginMetaOf<K extends PluginId> = PluginTypeMap[K]['meta']
export type PluginGameConfigOf<K extends PluginId> = PluginTypeMap[K]['gameConfig']

/** Union of every plugin's metadata. Used at the dynamic `Dynamic` dispatch
 *  boundary where a specific meta editor cannot be statically correlated with
 *  its metadata type. */
export type AnyMeta = PluginMetaOf<PluginId>

/** Union of every plugin's per-game config. Used at the dynamic `Dynamic`
 *  dispatch boundary where a specific editor cannot be statically correlated
 *  with its config. */
export type AnyGameConfig = NonNullable<PluginGameConfigOf<PluginId>>

// ── Plugin definition ────────────────────────────────────────────────────────

export interface PluginDefinition<K extends PluginId> {
  info: PluginInfo
  metaKey: K
  configDefaults?: PluginGameConfigOf<K>
  MetaEditor?: Component<ConfigEditorProps<PluginMetaOf<K>>>
  GameEditor?: Component<ConfigEditorProps<NonNullable<PluginGameConfigOf<K>>>>
}

export type AnyPluginDef = { [K in PluginId]: PluginDefinition<K> }[PluginId]

// ── Typed helpers ─

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

/** Whether a plugin has a real (non no-op) effect on the current platform. */
export function isPluginAvailable(info: PluginInfo): boolean {
  if (!info.platforms) return true
  return info.platforms.some(
    p => (p === 'windows' && isWindows) || (p === 'linux' && isLinux)
  )
}

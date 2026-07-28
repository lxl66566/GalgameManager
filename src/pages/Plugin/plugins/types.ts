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
import { isLinux, isMac, isWindows } from '~/utils/platform'
import type { Component } from 'solid-js'

// ── Plugin info (presentation metadata, frontend-only) ────────────────────────

/** Union of every plugin's per-game config. Used at the dynamic `Dynamic`
 *  dispatch boundary where a specific editor cannot be statically correlated
 *  with its config. */
export type AnyGameConfig = NonNullable<PluginGameConfigOf<PluginId>>

/** Union of every plugin's metadata. Used at the dynamic `Dynamic` dispatch
 *  boundary where a specific meta editor cannot be statically correlated with
 *  its metadata type. */
export type AnyMeta = PluginMetaOf<PluginId>

// ── Config editor component props ────────────────────────────────────────────

export type AnyPluginDef = { [K in PluginId]: PluginDefinition<K> }[PluginId]

// ── Type-level plugin mapping ────────────────────────────────────────────────

export interface ConfigEditorProps<T> {
  config: T
  /**
   * Commit callback — called when the user finishes editing a field.
   *
   * For text fields this fires on blur; for discrete controls (select, switch)
   * it fires immediately on change.
   *
   * In the Plugin page context this writes to disk; in the Game edit modal
   * it only updates a local in-memory store.
   */
  onCommit: (config: T) => void
}

export interface PluginDefinition<K extends PluginId> {
  configDefaults?: PluginGameConfigOf<K>
  GameEditor?: Component<ConfigEditorProps<NonNullable<PluginGameConfigOf<K>>>>
  info: PluginInfo
  MetaEditor?: Component<ConfigEditorProps<PluginMetaOf<K>>>
  metaKey: K
}
export type PluginGameConfigOf<K extends PluginId> = PluginTypeMap[K]['gameConfig']
export type PluginId = keyof PluginTypeMap

export interface PluginInfo {
  author: string
  descriptionKey: string
  id: string
  links: readonly { label: string; url: string }[]
  nameKey: string
  /**
   * Platforms where the plugin has a real effect. When omitted the plugin
   * works everywhere. Used to show an "unavailable on this platform" hint.
   */
  platforms?: readonly PluginPlatform[]
  version: string
}

export type PluginMetaOf<K extends PluginId> = PluginTypeMap[K]['meta']

// ── Plugin definition ────────────────────────────────────────────────────────

/** Platforms on which a plugin's handler has a real (non no-op) effect. */
export type PluginPlatform = 'linux' | 'macos' | 'windows'

/**
 * Maps each metaKey (= field name in PluginMetadatas) to its types.
 * When adding a new plugin, add an entry here.
 */
export interface PluginTypeMap {
  autoUpload: { gameConfig: AutoUploadGameConfig; meta: AutoUploadPluginMeta }
  execute: { gameConfig: ExecuteGameConfig; meta: ExecutePluginMeta }
  gameWrapper: { gameConfig: GameWrapperGameConfig; meta: GameWrapperPluginMeta }
  localeEmulator: { gameConfig: LocaleEmulatorGameConfig; meta: LocaleEmulatorPluginMeta }
  translator: { gameConfig: TranslatorGameConfig; meta: TranslatorPluginMeta }
  voiceSpeedup: { gameConfig: VoiceSpeedupGameConfig; meta: VoiceSpeedupPluginMeta }
  voiceZerointerrupt: {
    gameConfig: VoiceZerointerruptGameConfig
    meta: VoiceZerointerruptPluginMeta
  }
  wine: { gameConfig: WineGameConfig; meta: WinePluginMeta }
}

// ── Typed helpers ─

export function buildNewInstance(
  def: AnyPluginDef,
  metas: PluginMetadatas
): PluginInstance {
  const gameConfig = resolveGameConfig(def, metas)
  if (gameConfig !== undefined) {
    return { config: gameConfig, pluginId: def.metaKey } as PluginInstance
  }
  return { pluginId: def.metaKey } as PluginInstance
}

export function getPluginMeta<K extends PluginId>(
  key: K,
  metas: PluginMetadatas
): PluginMetaOf<K> {
  return metas[key]
}

/** Whether a plugin has a real (non no-op) effect on the current platform. */
export function isPluginAvailable(info: PluginInfo): boolean {
  if (!info.platforms) return true
  return info.platforms.some(
    p =>
      (p === 'windows' && isWindows) ||
      (p === 'linux' && isLinux) ||
      (p === 'macos' && isMac)
  )
}

export function patchPluginMeta<K extends PluginId>(
  key: K,
  metas: PluginMetadatas,
  patch: Partial<PluginMetaOf<K>>
): PluginMetadatas {
  return { ...metas, [key]: { ...metas[key], ...patch } }
}

export function resolveGameConfig(def: AnyPluginDef, metas: PluginMetadatas): unknown {
  const meta = metas[def.metaKey] as Record<string, unknown>
  const userDefaults = meta.configDefaults as Record<string, unknown> | undefined
  if (userDefaults && Object.keys(userDefaults).length > 0) {
    return { ...userDefaults }
  }
  return def.configDefaults ? { ...(def.configDefaults as object) } : undefined
}

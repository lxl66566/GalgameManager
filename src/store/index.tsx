import { type Config } from '@bindings/Config'
import type { Device } from '@bindings/Device'
import type { Game } from '@bindings/Game'
import type { PluginMetadatasPatch as RustPluginMetadatasPatch } from '@bindings/PluginMetadatasPatch'
import type { SettingsPatch as RustSettingsPatch } from '@bindings/SettingsPatch'
import type { UploadConfigStatus } from '@bindings/UploadConfigStatus'
import { myToast, type ToastVariant } from '@components/ui/myToast'
import * as i18n from '@solid-primitives/i18n'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { resolveBackendI18n } from '@utils/backendI18n'
import { errToStr, log } from '@utils/log'
import {
  appendDeviceOp,
  appendGameOp,
  applyPatch,
  deleteGameOp,
  diffGame,
  expandPatch,
  mergeConfigPatches,
  modifyDeviceOp,
  modifyGameOp,
  type ConfigPatch,
  type DeepPartial
} from '@utils/patch'
import { onCleanup, onMount } from 'solid-js'
import { createStore, produce, reconcile, unwrap } from 'solid-js/store'
import toast from 'solid-toast'

import { type Dictionary } from '~/i18n'

import { currentDeviceId } from './Singleton'

type PluginMetadatasPatch = DeepPartial<RustPluginMetadatasPatch>
// Re-alias the ts-rs output through DeepPartial so callers can omit any
// nested field (matches the wire-level `#[serde(default)]` behavior).
type SettingsPatch = DeepPartial<RustSettingsPatch>

// Injected by the Rust initialization_script before any page script runs
// (see src-tauri/src/lib.rs). It is the serialized snapshot of the Rust-side
// CONFIG static, used as the store's initial value so the first render has
// real config.games without waiting for an IPC round trip.
declare global {
  // Ambient global declaration: `var` (required for `declare global`) makes
  // the property visible on `globalThis` so `unicorn/prefer-global-this` and
  // the typed access both work.
  var __INITIAL_CONFIG__: Config
}

// ── Backend toast listener ──────────────────────────────────────────────────

interface ToastEventPayload {
  message: string
  /** Optional stable ID used to identify a loading toast for later dismissal. */
  toast_id?: string
  variant: string
}

/**
 * Start listening for `toast://show` and `toast://dismiss` events emitted by
 * the Rust backend.  Returns an unlisten function for each listener.
 */
const startToastListener = async (t: i18n.Translator<Dictionary>) => {
  const validVariants = new Set(['default', 'error', 'loading', 'success', 'warning'])

  const unlistenShow = await listen<ToastEventPayload>('toast://show', event => {
    const { message, toast_id, variant } = event.payload
    const v = (validVariants.has(variant) ? variant : 'default') as ToastVariant
    const resolved = resolveBackendI18n(
      message,
      key => t(key as keyof Dictionary) as string
    )
    const toastId = toast_id ?? undefined
    myToast({ message: resolved, toastId, variant: v })
  })

  const unlistenDismiss = await listen<string>('toast://dismiss', event => {
    toast.dismiss(event.payload)
  })

  return () => {
    unlistenShow()
    unlistenDismiss()
  }
}

// ── Config store ─

// No DEFAULT_CONFIG on the TS side: the initial value is injected by the
// Rust initialization_script (window.__INITIAL_CONFIG__), identical to
// Config::default() / on-disk config. TS only consumes it, avoiding drift.
const [config, setConfig] = createStore<Config>(globalThis.__INITIAL_CONFIG__)

// Module-level translator so non-component helpers (refreshConfig,
// sendPatch) can localize toasts. Captured in useConfigInit (wired by App
// before any of these can fire); the translator itself is reactive to
// locale switches since it is backed by a resource.
let tRef: i18n.Translator<Dictionary> | undefined

/** Localized text with an English fallback for the (theoretical) window
 *  before useConfigInit runs. */
const tt = (key: keyof Dictionary, fallback: string): string =>
  (tRef?.(key) as string | undefined) ?? fallback

export const useConfigInit = (t?: i18n.Translator<Dictionary>, onReady?: () => void) => {
  tRef = t
  onMount(() => {
    let unlisten: (() => void) | undefined
    let unlistenToast: (() => void) | undefined
    let isMounted = true

    const init = async () => {
      // Initial config is already injected by the initialization_script (see
      // lib.rs), so only listeners need registering. refreshConfig races the
      // listener registration: listeners must be ready before config://updated
      // can fire, so refreshConfig is awaited only after Promise.all — no
      // missed events, no blocked registration.
      const refreshPromise = refreshConfig()

      // Backend toast listener (needs t for i18n resolution) + config://updated
      const toastTask: Promise<(() => void) | undefined> = t
        ? startToastListener(t)
        : Promise.resolve(undefined)
      const listenTask = listen<Config>('config://updated', event => {
        setConfig(reconcile(event.payload))
      })

      const [toastFunction, function_] = await Promise.all([toastTask, listenTask])

      // Unmounted while awaiting: unregister immediately to avoid leaks
      if (!isMounted) {
        toastFunction?.()
        function_()
        return
      }

      unlistenToast = toastFunction
      unlisten = function_

      // Wait for refreshConfig. The initial value is already injected; this is
      // defensive, correcting any external change made during registration.
      await refreshPromise

      // Corrupted-config fallback: the backend detects a corrupt config.toml at
      // startup and silently falls back to defaults, but the webview has no
      // listener yet at that point, so the emitted toast is lost — query here.
      try {
        if (await invoke<boolean>('config_was_corrupted')) {
          myToast({
            message: tt(
              'hint.configCorrupted',
              'Config file was corrupted; started with defaults (backup: config.toml.bak)'
            ),
            variant: 'warning'
          })
        }
      } catch (error) {
        log.error(`Failed to query config corruption flag: ${errToStr(error)}`)
      }

      // onReady fires after at least one await, so we are already on the
      // microtask queue and all synchronous SolidJS effects (colorMode dark
      // class, Toaster mergeContainerOptions) have run — toasts triggered by
      // onReady render with the correct position and theme.
      // isMounted is flipped to false by the onCleanup closure below; the
      // type checker can't see that cross-callback mutation, so the guard
      // is not unnecessary.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!isMounted) return
      onReady?.()
    }

    void init()

    onCleanup(() => {
      isMounted = false
      unlisten?.()
      unlistenToast?.()
    })
  })
}

const refreshConfig = async () => {
  try {
    const data = await invoke<Config>('get_config')
    setConfig(reconcile(data))
  } catch (error) {
    log.error(`Failed to load local config: ${errToStr(error)}`)
    toast.error(
      `${tt('hint.failToLoadLocalConfig', 'Failed to load local config')}: ${errToStr(error)}`
    )
  }
}

// Pull the remote config and offer an undo action.
export const checkAndPullRemote = async (
  t: i18n.Translator<Dictionary>,
  skipCheck?: boolean
) => {
  // skipCheck === false means auto-pull: stay silent when unconfigured
  if (!skipCheck && config.settings.storage.provider === 'none') {
    toast(t('hint.remoteNotConfigured'))
    return
  }
  // Loading toast; replaced in place (same id) by the result message
  const toastId = toast.loading(t('hint.checkingRemoteConfig'))
  try {
    const [oldConfig, remoteIsNone] = await invoke<[Config | null, boolean]>(
      'apply_remote_config',
      { safe: !skipCheck }
    )
    if (skipCheck && remoteIsNone) {
      toast.error(t('hint.remoteConfigNotFound'), { id: toastId })
      return
    }
    if (oldConfig) {
      myToast({
        actions: [
          {
            label: t('ui.withdraw'),
            onClick: () => {
              setConfig(reconcile(oldConfig))
              // Restore to disk. Must be save_config (full overwrite), not
              // patch_config — a patch only carries declared fields, while
              // undo means "force-restore to this snapshot".
              void (async () => {
                try {
                  await invoke('save_config', { newConfig: oldConfig })
                  toast.success(t('hint.restorePreviousConfigSuccess'))
                } catch (error) {
                  toast.error(
                    t('hint.restorePreviousConfigFailed') + ': ' + errToStr(error)
                  )
                  void refreshConfig()
                }
              })()
            },
            variant: 'secondary'
          }
        ],
        message: skipCheck ? t('hint.forceUpdatedConfig') : t('hint.appliedNewConfig'),
        title: t('hint.syncSuccess'),
        toastId,
        variant: 'success'
      })
    } else {
      toast.success(t('hint.localIsTheNewest'), { id: toastId })
    }
  } catch (error) {
    // Only notify on auto-pull with a configured provider; avoids a scary
    // error toast on first launch
    if (skipCheck || !(error as Error).toString().includes('Storage provider not set')) {
      toast.error(t('hint.checkRemoteConfigFailed') + ': ' + errToStr(error), {
        id: toastId
      })
    } else {
      toast.dismiss(toastId)
    }
  }
}

export const performAutoUpload = async (t: i18n.Translator<Dictionary>) => {
  log.info('[ConfigAutoUpload] Triggered')
  try {
    const res = await invoke<UploadConfigStatus>('upload_config', { safe: true })
    if (res === 'uploaded') {
      toast.success(t('hint.configAutoUploadSuccess'))
    } else if (res === 'conflict') {
      toast.error(t('hint.configUploadConflict'))
    }
  } catch (error) {
    toast.error(t('hint.configAutoUploadFailed') + ': ' + errToStr(error))
  }
}

export const performManualUpload = async (t: i18n.Translator<Dictionary>) => {
  log.info('[ConfigManualUpload] Triggered')
  try {
    const res = await invoke<UploadConfigStatus>('upload_config', { safe: false })
    if (res === 'uploaded') {
      toast.success(t('hint.configUploadSuccess'))
    } else if (res === 'conflict') {
      toast.error(t('hint.configUploadConflict'))
    }
  } catch (error) {
    toast.error(t('hint.configUploadFailed') + ': ' + errToStr(error))
  }
}

/** Immediate patch IPC for actions that know exactly which field they
 *  changed. On failure, re-sync with the backend so the store doesn't
 *  diverge from what was actually persisted. */
const sendPatch = async (patch: ConfigPatch) => {
  try {
    await invoke('patch_config', { patch })
  } catch (error) {
    toast.error(
      `${tt('hint.saveConfigFailed', 'Failed to save config')}: ${errToStr(error)}`
    )
    void refreshConfig()
  }
}

/** Debounced patch IPC with accumulation. Multiple `schedulePatch` calls
 *  within the debounce window merge into one invoke (`games` ops concatenate,
 *  other fields take the latest). Per the project rule, frequent callbacks
 *  (input onChange, parallel image downloads) must go through this rather
 *  than firing one IPC per keystroke. */
let pendingPatch: ConfigPatch | null = null
let patchDebounceTimer: ReturnType<typeof setTimeout> | undefined
const PATCH_DEBOUNCE_MS = 500

const flushPendingPatch = () => {
  patchDebounceTimer = undefined
  if (!pendingPatch) return
  const p = pendingPatch
  pendingPatch = null
  void sendPatch(p)
}

const schedulePatch = (patch: ConfigPatch) => {
  pendingPatch = pendingPatch ? mergeConfigPatches(pendingPatch, patch) : { ...patch }
  if (patchDebounceTimer) clearTimeout(patchDebounceTimer)
  patchDebounceTimer = setTimeout(flushPendingPatch, PATCH_DEBOUNCE_MS)
}

export const useConfig = () => {
  return {
    actions: {
      addGame: (game: Game) => {
        game.addedTime = new Date().toISOString()
        const g = unwrap(game)
        setConfig(
          produce(state => {
            state.games.push(g)
          })
        )
        void sendPatch(appendGameOp(g))
      },
      /** Replace one game's daily playtime map and total use time in one
       *  patch (the statistics page's daily-playtime editor). `useTime` must
       *  be precomputed by the caller as a delta against the live value —
       *  never an absolute sum, since most games' totals predate the
       *  daily-statistics feature and don't equal sum(dailyPlaytime). */
      editGamePlaytime: (
        id: number,
        dailyPlaytime: Record<string, number>,
        useTime: [number, number]
      ) => {
        setConfig(
          produce(state => {
            const game = state.games.find(g => g.id === id)
            if (!game) return
            game.dailyPlaytime = dailyPlaytime
            game.useTime = useTime
          })
        )
        void sendPatch(modifyGameOp(id, { dailyPlaytime, useTime }))
      },
      getCurrentDevice: async (): Promise<Device | undefined> => {
        const uid = await currentDeviceId()
        return config.devices.find(d => d.uid === uid)
      },
      getCurrentDeviceOrDefault: async (): Promise<Device> => {
        const uid = await currentDeviceId()
        const device = config.devices.find(d => d.uid === uid) ?? {
          name: `Unnamed${config.devices.length + 1}`,
          uid: uid,
          variables: {}
        }
        return device
      },
      removeGame: (id: number) => {
        setConfig(
          produce(state => {
            // Resolve by id at apply time: callers capture the id when the
            // user clicks, and an index captured earlier can point at a
            // different game once an await (remote archive deletion) or a
            // pending confirm toast lets the list change in between.
            const idx = state.games.findIndex(g => g.id === id)
            if (idx >= 0) {
              state.games.splice(idx, 1)
            }
          })
        )
        void sendPatch(deleteGameOp(id))
      },
      replaceGame: (index: number, game: Game) => {
        const existing = config.games[index]
        if (!existing) return
        const id = existing.id
        // Edit dialog path: we don't know which fields the user touched, so
        // diff against the store's pre-image of this game (captured before
        // the produce below). Fields written only by the backend (use_time,
        // daily_playtime) are identical on both sides of the diff, so they
        // never land in the patch and can't be reverted by a stale snapshot.
        const preImage = unwrap(existing)
        const g = unwrap(game)
        setConfig(
          produce(state => {
            if (state.games[index]) {
              state.games[index] = g
            }
          })
        )
        const gp = diffGame(preImage, g)
        if (Object.keys(gp).length > 0) {
          void sendPatch(modifyGameOp(id, gp))
        }
      },
      /** Patch a single game's `coverColor` in place (reference-preserving)
       *  and persist with a debounced write. Paired with `setImageHash`:
       *  clearing happens there (on image change), setting happens here (once
       *  the backend has extracted the color for the current cover). */
      setCoverColor: (index: number, color: string) => {
        const id = config.games[index]?.id
        if (id === undefined) return
        setConfig(
          produce(state => {
            if (state.games[index]) {
              state.games[index].coverColor = color
            }
          })
        )
        schedulePatch(modifyGameOp(id, { coverColor: color }))
      },
      /** Patch a single game's `imageSha256` in place (reference-preserving)
       *  and persist with a debounced write. Keeping the game object identity
       *  stable avoids re-mounting its card in the virtualized grid and avoids
       *  an unnecessary full `replaceGame` + immediate disk write each time an
       *  image finishes downloading (which can fire many times at startup).
       *  When the resolved hash differs from the stored one (the cover
       *  actually changed), `coverColor` is cleared too — `#[patch(nullable)]`
       *  on the Rust side lets explicit `null` mean "clear", so the stale
       *  accent color can't survive on disk. The next load re-extracts a
       *  fresh color and sets it via `setCoverColor`. */
      setImageHash: (index: number, hash: string) => {
        const g = config.games[index]
        // Bail on no-op: the patch below also clears `coverColor`, which must
        // only happen when the cover actually changed.
        if (!g || g.imageSha256 === hash) return
        const id = g.id
        setConfig(
          produce(state => {
            const game = state.games[index]
            if (game) {
              game.imageSha256 = hash
              game.coverColor = null
            }
          })
        )
        schedulePatch(modifyGameOp(id, { coverColor: null, imageSha256: hash }))
      },
      updateCurrentDevice: async (device: Device) => {
        const uid = await currentDeviceId()
        const deviceUnwrap = unwrap(device)
        const isExisted = config.devices.some(d => d.uid === uid)
        setConfig(
          produce(state => {
            const index = state.devices.findIndex(d => d.uid === uid)
            if (index === -1) {
              state.devices.push(deviceUnwrap)
            } else {
              state.devices[index] = deviceUnwrap
            }
          })
        )
        // Match the local decision: modify if the device already existed,
        // otherwise append. Either way only this one device touches the wire.
        // NOTE: the modify op enumerates every patchable `Device` field
        // (i.e. all of `DevicePatch` — `uid` is `#[patch(skip)]`). If
        // `Device` gains a field, add it here too or it will be silently
        // dropped from the patch.
        if (isExisted) {
          void sendPatch(
            modifyDeviceOp(uid, {
              name: deviceUnwrap.name,
              variables: deviceUnwrap.variables
            })
          )
        } else {
          void sendPatch(appendDeviceOp(deviceUnwrap))
        }
      },
      /** Like {@link updateCurrentDevice} but debounces the IPC. */
      updateCurrentDeviceDebounced: async (device: Device) => {
        const uid = await currentDeviceId()
        const deviceUnwrap = unwrap(device)
        const isExisted = config.devices.some(d => d.uid === uid)
        setConfig(
          produce(state => {
            const index = state.devices.findIndex(d => d.uid === uid)
            if (index === -1) {
              state.devices.push(deviceUnwrap)
            } else {
              state.devices[index] = deviceUnwrap
            }
          })
        )
        if (isExisted) {
          schedulePatch(
            modifyDeviceOp(uid, {
              name: deviceUnwrap.name,
              variables: deviceUnwrap.variables
            })
          )
        } else {
          schedulePatch(appendDeviceOp(deviceUnwrap))
        }
      },
      updateDeviceVar: (deviceUid: string, key: string, value: string) => {
        setConfig(
          produce(state => {
            const device = state.devices.find(d => d.uid === deviceUid)
            if (device) {
              device.variables[key] = value
            }
          })
        )
        // Send only the modified device's variables map (whole-map
        // replacement — struct-patch has no per-key HashMap patch, but the
        // var map is small).
        const device = config.devices.find(d => d.uid === deviceUid)
        if (device) {
          void sendPatch(
            modifyDeviceOp(deviceUid, { variables: { ...device.variables } })
          )
        }
      },
      /** Declarative plugin-metadata patch (e.g. enabling/disabling a plugin,
       *  editing its defaults). Same pattern as `updateSettings`. */
      updatePluginMetadatas: (patch: PluginMetadatasPatch) => {
        setConfig(
          produce(state => {
            applyPatch(state.pluginMetadatas, patch)
          })
        )
        void sendPatch({ pluginMetadatas: expandPatch(config.pluginMetadatas, patch) })
      },
      /** Declarative settings patch. Caller passes a deep-partial
       *  `SettingsPatch` describing exactly what changed; we merge it into
       *  the store, then expand it to the whole-sub-object wire form
       *  (settings sub-structs are whole-replacement on the backend). */
      updateSettings: (patch: SettingsPatch) => {
        setConfig(
          produce(state => {
            applyPatch(state.settings, patch)
          })
        )
        void sendPatch({ settings: expandPatch(config.settings, patch) })
      },
      /** Like {@link updateSettings} but debounces the IPC. Use in frequent
       *  callbacks (e.g. text input onChange). */
      updateSettingsDebounced: (patch: SettingsPatch) => {
        setConfig(
          produce(state => {
            applyPatch(state.settings, patch)
          })
        )
        schedulePatch({ settings: expandPatch(config.settings, patch) })
      }
    },
    config,
    refresh: refreshConfig
  }
}

// src/stores/configStore.ts
import { type Config } from '@bindings/Config'
import type { Device } from '@bindings/Device'
import type { Game } from '@bindings/Game'
import type { Settings } from '@bindings/Settings'
import { myToast, type ToastVariant } from '@components/ui/myToast'
import * as i18n from '@solid-primitives/i18n'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { log } from '@utils/log'
import { type Dictionary } from '~/i18n'
import { onCleanup, onMount } from 'solid-js'
import { createStore, produce, unwrap } from 'solid-js/store'
import toast from 'solid-toast'
import { currentDeviceId } from './Singleton'

// ── Backend toast listener ──────────────────────────────────────────────────

interface ToastEventPayload {
  variant: string
  message: string
  /** Optional stable ID used to identify a loading toast for later dismissal. */
  toast_id?: string
}

/**
 * Resolve i18n keys in backend toast messages.
 *
 * Backend messages may contain `<i18n.key>` tokens which are replaced
 * with the translated string.  Everything outside `<>` is kept as-is.
 * Nested or unclosed tags are left untouched.
 *
 * Example: `"AutoUpload: <hint.syncFailed>game X"` → `"AutoUpload: 同步失败: game X"`
 */
function resolveBackendI18n(raw: string, t: i18n.Translator<Dictionary>): string {
  return raw.replace(/<([a-zA-Z0-9._]+)>/g, (_match, key: string) => {
    // t() returns the key itself when not found, which is fine
    return t(key as keyof Dictionary) as string
  })
}

/**
 * Start listening for `toast://show` and `toast://dismiss` events emitted by
 * the Rust backend.  Returns an unlisten function for each listener.
 */
const startToastListener = async (t: i18n.Translator<Dictionary>) => {
  const validVariants = new Set(['success', 'error', 'warning', 'default', 'loading'])

  const unlistenShow = await listen<ToastEventPayload>('toast://show', event => {
    const { variant, message, toast_id } = event.payload
    const v = (validVariants.has(variant) ? variant : 'default') as ToastVariant
    const resolved = resolveBackendI18n(message, t)
    const toastId = toast_id ?? undefined
    myToast({ variant: v, message: resolved, toastId })
  })

  const unlistenDismiss = await listen<string>('toast://dismiss', event => {
    toast.dismiss(event.payload)
  })

  // Return a single cleanup function that unregisters both listeners.
  return () => {
    unlistenShow()
    unlistenDismiss()
  }
}

// ── Config store ────────────────────────────────────────────────────────────

// 初始空状态
const DEFAULT_CONFIG: Config = {
  dbVersion: 0,
  lastUpdated: new Date().toISOString(),
  lastSync: null,
  lastUploaded: null,
  games: [],
  devices: [],
  settings: {
    storage: {
      provider: 'local',
      local: { path: '' },
      webdav: {
        endpoint: '',
        username: '',
        password: '',
        rootPath: ''
      },
      s3: {
        bucket: '',
        region: '',
        endpoint: '',
        accessKey: '',
        secretKey: ''
      }
    },
    archive: {
      algorithm: 'squashfsZstd',
      level: 3,
      backupBeforeRestore: true
    },
    appearance: {
      theme: 'system',
      language: 'zh-CN'
    },
    launch: {
      precisionMode: true
    },
    autoSyncInterval: 1200,
    syncIoTimeoutSecs: 60,
    syncNonIoTimeoutSecs: 15
  },
  pluginMetadatas: {
    execute: {
      enabled: true,
      autoAdd: false,
      configDefaults: {
        on: 'beforeGameStart',
        cmd: '',
        passExePath: false,
        currentDir: '',
        env: {},
        exitSignal: 'none'
      }
    },
    autoUpload: {
      enabled: true,
      autoAdd: false
    },
    gameWrapper: {
      enabled: true,
      autoAdd: false,
      configDefaults: {
        cmd: '',
        currentDir: '',
        env: {}
      }
    },
    localeEmulator: {
      enabled: true,
      autoAdd: false,
      configDefaults: {
        cmd: 'your_path/LEProc.exe "{}"'
      }
    },
    translator: {
      enabled: true,
      autoAdd: false,
      configDefaults: {
        cmd: '',
        currentDir: ''
      }
    },
    voiceSpeedup: {
      enabled: true,
      autoAdd: false,
      configDefaults: {
        speed: 1.5,
        provider: 'mmdevapi',
        arch: 'auto'
      }
    },
    voiceZerointerrupt: {
      enabled: true,
      autoAdd: false,
      configDefaults: {
        arch: 'auto'
      }
    }
  }
}

const [config, setConfig] = createStore<Config>(DEFAULT_CONFIG)

export const useConfigInit = (t?: i18n.Translator<Dictionary>) => {
  onMount(() => {
    let unlisten: (() => void) | undefined
    let unlistenToast: (() => void) | undefined
    let mounted = true

    const init = async () => {
      // 0. Listen for backend toast events (needs t for i18n resolution)
      if (t) {
        const toastFn = await startToastListener(t)
        if (!mounted) {
          toastFn()
          return
        }
        unlistenToast = toastFn
      }

      // 1. 监听 Rust 端的主动推送
      const fn = await listen<Config>('config://updated', event => {
        console.log('Config updated from Rust:', event.payload)
        setConfig(event.payload)
      })

      // 如果 await 期间组件已卸载，立即注销监听，防止内存泄漏
      if (!mounted) {
        fn()
        return
      }

      unlisten = fn

      // 2. 获取本地最新配置 (监听建立后再拉取，确保不漏消息)
      await refreshConfig()
    }

    init()

    onCleanup(() => {
      mounted = false
      unlisten?.()
      unlistenToast?.()
    })
  })
}

const refreshConfig = async () => {
  try {
    const data = await invoke<Config>('get_config')
    setConfig(data)
  } catch (e) {
    console.error('Failed to load local config:', e)
    toast.error(`Failed to load local config: ${e}`)
  }
}

// 核心逻辑：拉取远端并提供撤回
export const checkAndPullRemote = async (
  t: i18n.Translator<Dictionary>,
  skipCheck?: boolean
) => {
  // skipCheck 为 false 为自动拉取，不提醒
  if (!skipCheck && config.settings.storage.provider === 'none') {
    toast(t('hint.remoteNotConfigured'))
    return
  }
  try {
    const [oldConfig, remoteIsNone] = await invoke<[Config | null, boolean]>(
      'apply_remote_config',
      { safe: !skipCheck }
    )
    // 如果是手动拉取，则 toast 提示
    if (skipCheck && remoteIsNone) {
      toast.error(t('hint.remoteConfigNotFound'))
      return
    }
    if (oldConfig) {
      // 弹出带撤回按钮的 Toast
      myToast({
        variant: 'success',
        title: t('hint.syncSuccess'),
        message: skipCheck ? t('hint.forceUpdatedConfig') : t('hint.appliedNewConfig'),
        actions: [
          {
            label: t('ui.withdraw'),
            variant: 'secondary',
            onClick: () => {
              setConfig(oldConfig)
              // 恢复旧配置到磁盘
              ;(async () => {
                invoke('save_config', { newConfig: oldConfig })
                toast.success(t('hint.restorePreviousConfigSuccess'))
              })()
            }
          }
        ]
      })
    } else {
      toast.success(t('hint.localIsTheNewest'))
    }
  } catch (e) {
    // 只在自动拉取且配置了存储后端时提示，提升首次启动的体验
    if (skipCheck || !(e as Error).toString().includes('Storage provider not set')) {
      toast.error(t('hint.checkRemoteConfigFailed') + ': ' + e)
    }
  }
}

export const performAutoUpload = async (t: i18n.Translator<Dictionary>) => {
  log.info('[ConfigAutoUpload] Triggered')
  try {
    const res = await invoke<boolean>('upload_config', { safe: true })
    if (res) {
      toast.success(t('hint.configAutoUploadSuccess'))
    }
  } catch (e) {
    toast.error(t('hint.configAutoUploadFailed') + ': ' + e)
  }
}

export const performManualUpload = async (t: i18n.Translator<Dictionary>) => {
  log.info('[ConfigManualUpload] Triggered')
  try {
    await invoke<boolean>('upload_config', { safe: false })
    toast.success(t('hint.configUploadSuccess'))
  } catch (e) {
    toast.error(t('hint.configUploadFailed') + ': ' + e)
  }
}

// 用户触发的保存操作
const save = async () => {
  try {
    console.log('save invoked')
    await invoke('save_config', { newConfig: unwrap(config) })
  } catch (e) {
    toast.error(`Failed to save config: ${e}`)
  }
}

export const useConfig = () => {
  return {
    config,
    refresh: refreshConfig,
    save,
    actions: {
      addGame: (game: Game) => {
        game.addedTime = new Date().toISOString()
        setConfig(
          produce(state => {
            state.games.push(unwrap(game))
          })
        )
        save()
      },
      removeGame: (index: number) => {
        setConfig(
          produce(state => {
            state.games.splice(index, 1)
          })
        )
        save()
      },
      replaceGame: (index: number, game: Game) => {
        setConfig(
          produce(state => {
            if (state.games[index]) {
              state.games[index] = unwrap(game)
            }
          })
        )
        save()
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
        save()
      },
      updateSettings: (fn: (settings: Settings) => void) => {
        setConfig(produce(state => fn(state.settings)))
        save()
      },
      getCurrentDevice: async (): Promise<Device | undefined> => {
        const uid = await currentDeviceId()
        return config.devices.find(d => d.uid === uid)
      },
      getCurrentDeviceOrDefault: async (): Promise<Device> => {
        const uid = await currentDeviceId()
        const device = config.devices.find(d => d.uid === uid) || {
          name: 'Unnamed' + (config.devices.length + 1),
          uid: uid,
          variables: {}
        }
        return device
      },
      updateCurrentDevice: async (device: Device) => {
        const uid = await currentDeviceId()
        const deviceUnwrap = unwrap(device)
        setConfig(
          produce(state => {
            const index = state.devices.findIndex(d => d.uid === uid)
            if (index !== -1) {
              state.devices[index] = deviceUnwrap
            }
            // 如果没有找到，则添加
            else {
              state.devices.push(deviceUnwrap)
            }
          })
        )
        save()
      },
      mutate: (fn: (state: Config) => void) => {
        setConfig(produce(fn))
        save()
      }
    }
  }
}

/* usage:

calls initConfig() in App.tsx, then use `const { config, actions } = useConfig();` in other components

*/

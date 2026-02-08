// src/stores/configStore.ts
import { type Config } from '@bindings/Config'
import type { Device } from '@bindings/Device'
import type { Game } from '@bindings/Game'
import type { Settings } from '@bindings/Settings'
import { myToast } from '@components/ui/myToast'
import * as i18n from '@solid-primitives/i18n'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { log } from '@utils/log'
import { type Dictionary } from '~/i18n'
import { onCleanup, onMount } from 'solid-js'
import { createStore, produce, unwrap } from 'solid-js/store'
import toast from 'solid-toast'
import { useAutoUploadService } from './AutoUploadService'
import { currentDeviceId } from './Singleton'

// 初始空状态
const DEFAULT_CONFIG: Config = {
  dbVersion: 0,
  lastUpdated: new Date().toISOString(),
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
    autoSyncInterval: 1200
  }
}

const [config, setConfig] = createStore<Config>(DEFAULT_CONFIG)

export const useConfigInit = () => {
  onMount(() => {
    let unlisten: (() => void) | undefined
    let mounted = true

    const init = async () => {
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
    if (skipCheck || !(e as Error).message.includes('Storage provider not set')) {
      toast.error(t('hint.checkRemoteConfigFailed') + ': ' + e)
    }
  }
}

export const performAutoUpload = async (t: i18n.Translator<Dictionary>) => {
  log.info('[ConfigAutoUpload] Triggered')
  try {
    const res = await invoke<boolean>('upload_config', { safe: true })

    // 成功自动上传
    if (res) {
      setConfig('lastUploaded', new Date().toISOString())
      save()
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
    setConfig('lastUploaded', new Date().toISOString())
    save()
    toast.success(t('hint.configUploadSuccess'))
  } catch (e) {
    toast.error(t('hint.configUploadFailed') + ': ' + e)
  }
}

// 用户触发的保存操作
const save = async () => {
  try {
    setConfig('lastUpdated', new Date().toISOString())
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

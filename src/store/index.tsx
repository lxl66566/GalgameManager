// src/stores/configStore.ts
import { type Config } from '@bindings/Config'
import type { Device } from '@bindings/Device'
import type { Game } from '@bindings/Game'
import type { Settings } from '@bindings/Settings'
import { myToast } from '@components/ui/myToast'
import * as i18n from '@solid-primitives/i18n'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { type Dictionary } from '~/i18n'
import { onCleanup } from 'solid-js'
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

// 初始化
export const initConfig = async () => {
  // 1. 监听 Rust 端的主动推送
  const unlisten = await listen<Config>('config://updated', event => {
    console.log('Config updated from Rust:', event.payload)
    setConfig(event.payload)
  })

  // 2. 获取本地最新配置
  await refreshConfig()

  onCleanup(() => {
    unlisten()
  })
}

export const postInitConfig = async (t: i18n.Translator<Dictionary>) => {
  // 3. 检查远端配置
  await checkAndPullRemote(t)

  // 4. 启动自动上传任务
  useAutoUploadService({
    performUpload: async () => {
      await performUpload(t, true)
    }
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
    toast.error(t('hint.checkRemoteConfigFailed') + ': ' + e)
  }
}

export const performUpload = async (
  t: i18n.Translator<Dictionary>,
  isAutoUpload?: boolean
) => {
  try {
    // 调用 Rust 上传
    await invoke('upload_config')

    const now = new Date().toISOString()

    setConfig('lastUploaded', now)
    save()

    toast.success(
      isAutoUpload ? t('hint.configAutoUploadSuccess') : t('hint.configUploadSuccess')
    )
  } catch (e) {
    toast.error(
      (isAutoUpload ? t('hint.configAutoUploadFailed') : t('hint.configUploadFailed')) +
        ': ' +
        e
    )
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
      initConfig,
      addGame: (game: Game) => {
        game.addedTime = new Date().toISOString()
        setConfig(
          produce(state => {
            state.games.push(game)
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
      updateGame: (index: number, game: Game) => {
        setConfig(
          produce(state => {
            if (state.games[index]) {
              state.games[index] = game
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
        setConfig(
          produce(state => {
            const index = state.devices.findIndex(d => d.uid === uid)
            if (index !== -1) {
              state.devices[index] = device
            }
            // 如果没有找到，则添加
            else {
              state.devices.push(device)
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

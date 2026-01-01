// src/stores/configStore.ts
import { type Config } from '@bindings/Config'
import type { Device } from '@bindings/Device'
import type { Game } from '@bindings/Game'
import type { Settings } from '@bindings/Settings'
import { myToast } from '@components/ui/myToast'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useI18n } from '~/i18n'
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

export const postInitConfig = async () => {
  // 3. 检查远端配置
  await checkAndPullRemote()

  // 4. 启动自动上传任务
  useAutoUploadService({
    performUpload: async () => {
      await performUpload(true)
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
export const checkAndPullRemote = async (skipCheck?: boolean, toastMessage?: string) => {
  const { t } = useI18n()
  // skipCheck 为 false 为自动拉取，不提醒
  if (!skipCheck && config.settings.storage.provider === 'none') {
    toast(t('hint.remoteNotConfigured'))
    return
  }
  try {
    const remoteConfig = await invoke<Config | null>('get_remote_config')
    if (!remoteConfig) {
      console.log('Remote config is null')
      return
    }

    if (
      skipCheck ||
      // 只有当远端配置存在，且更新时间晚于本地配置时才更新
      new Date(remoteConfig.lastUpdated) > new Date(config.lastUpdated)
    ) {
      const previousConfig = unwrap(config) // 备份当前状态

      // 应用新配置
      setConfig(remoteConfig)
      // 持久化到本地磁盘 (不更新 lastUpdated，因为这是同步操作)
      await invoke('save_config', { newConfig: remoteConfig })

      // 弹出带撤回按钮的 Toast
      myToast({
        variant: 'success',
        title: t('hint.syncSuccess'),
        message: toastMessage || t('hint.appliedNewConfig'),
        actions: [
          {
            label: t('ui.withdraw'),
            variant: 'secondary',
            onClick: () => {
              setConfig(previousConfig)
              // 恢复旧配置到磁盘
              ;(async () => {
                invoke('save_config', { newConfig: previousConfig })
                toast.success(t('hint.restorePreviousConfigSuccess'))
              })()
            }
          }
        ]
      })
    } else {
      toast.success('Local config is the newest!')
    }
  } catch (e) {
    toast.error(`Failed to check remote config: ${e}`)
  }
}

export const performUpload = async (isAutoUpload?: boolean) => {
  const { t } = useI18n()
  try {
    // 调用 Rust 上传
    await invoke('upload_config')

    // 上传成功后，更新本地的 lastUploaded 状态
    // 注意：这里我们假设 Rust 上传成功就是以上次保存的状态为准
    // 或者 Rust 可能会返回一个新的 Config，视你的 Rust 实现而定。
    // 这里采用最稳妥的方式：更新 lastUploaded 为当前时间
    const now = new Date().toISOString()

    setConfig('lastUploaded', now)

    // 同时需要把这个 lastUploaded 的变更保存到本地磁盘，
    // 否则下次重启 app 又会觉得需要上传。
    // 这里调用 save 但不更新 lastUpdated (避免死循环：保存->更新时间->触发上传->保存->更新时间...)
    const newConfig = { ...unwrap(config), lastUploaded: now }
    await invoke('save_config', { newConfig })

    toast.success(
      isAutoUpload ? t('hint.configAutoUploadSuccess') : t('hint.configUploadSuccess')
    )
  } catch (e) {
    toast.error(
      isAutoUpload
        ? t('hint.configAutoUploadFailed')
        : t('hint.configUploadFailed') + ': ' + e
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

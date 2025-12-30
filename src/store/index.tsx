// src/stores/configStore.ts
import { type Config } from '@bindings/Config'
import type { Device } from '@bindings/Device'
import type { Game } from '@bindings/Game'
import type { Settings } from '@bindings/Settings'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
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
      local: '',
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

  // 3. 检查远端配置
  await checkAndPullRemote()

  // 4. 启动自动上传任务
  useAutoUploadService({
    performUpload: async () => {
      await performUpload(true)
    }
  })

  onCleanup(() => {
    unlisten()
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
      toast.custom(
        t => (
          <div class="flex items-center justify-between gap-4 px-4 py-3 bg-white dark:bg-neutral-800 rounded-md shadow-md border border-neutral-200 dark:border-neutral-700 min-w-[280px]">
            <span class="text-sm text-gray-700 dark:text-gray-200">
              {toastMessage || 'Remote config is newer, applied.'}
            </span>
            <button
              onClick={async () => {
                toast.dismiss(t.id)
                setConfig(previousConfig)
                // 恢复旧配置到磁盘
                await invoke('save_config', { newConfig: previousConfig })
                toast.success('Restored previous configuration')
              }}
              class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              Undo
            </button>
          </div>
        ),
        {
          duration: 10000,
          position: 'bottom-left'
        }
      )
    } else {
      toast.success('Local config is the newest!')
    }
  } catch (e) {
    toast.error(`Failed to check remote config: ${e}`)
  }
}

export const performUpload = async (isAutoUpload?: boolean) => {
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

    toast.success(`Config ${isAutoUpload ? 'auto ' : ''}upload successfully`)
  } catch (e) {
    toast.error(`Config ${isAutoUpload ? 'auto ' : ''}upload failed: ${e}`)
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

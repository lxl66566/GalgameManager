// src/stores/configStore.ts
import { type Config } from '@bindings/Config'
import type { Device } from '@bindings/Device'
import type { Game } from '@bindings/Game'
import type { Settings } from '@bindings/Settings'
import { invoke } from '@tauri-apps/api/core'
import { createStore, produce, unwrap } from 'solid-js/store'
import { currentDeviceId } from './Singleton'

// 初始空状态
const DEFAULT_CONFIG: Config = {
  dbVersion: 0,
  lastUpdated: new Date().toISOString(),
  games: [],
  devices: [],
  settings: {
    storage: {
      backend: {
        type: 'local',
        config: ''
      }
    },
    archive: {
      algorithm: 'squashfsZstd',
      level: 3
    },
    appearance: {
      theme: 'system',
      language: 'zh-CN'
    },
    currentDevice: {
      name: 'Default',
      uuid: '00000000-0000-0000-0000-000000000000',
      variables: {}
    }
  }
}

const [config, setConfig] = createStore<Config>(DEFAULT_CONFIG)

// 初始化：监听 Rust 事件并拉取初始数据
const initConfig = async () => {
  // 1. 监听来自 Rust 的更新 (例如其他窗口修改了配置，或者保存成功后的回显)
  // await listen<Config>('config://updated', event => {
  //   console.log('Config updated from Rust:', event.payload)
  //   setConfig(event.payload)
  // })

  // 2. 主动拉取一次
  refreshConfig()
}

const refreshConfig = async () => {
  try {
    const data = await invoke<Config>('get_config')
    setConfig(data)
  } catch (e) {
    console.error('Failed to load config:', e)
  }
}

// 核心操作：保存配置
// 使用 Solid 的 Store，我们可以直接修改 store，然后把 snapshot 发给 Rust
const save = async () => {
  try {
    const currentConfig = config

    // 更新 lastUpdated
    currentConfig.lastUpdated = new Date().toISOString()

    await invoke('save_config', { newConfig: unwrap(currentConfig) })
    // 注意：我们不需要在这里 setConfig，因为 save_config 成功后会 emit 事件
    // 或者你可以选择在这里乐观更新
  } catch (e) {
    console.error('Failed to save config:', e)
    // 如果失败，可能需要回滚状态（这里略过复杂的回滚逻辑，建议重新 fetch）
    refreshConfig()
  }
}

export const useConfig = () => {
  return {
    config,
    refresh: refreshConfig,
    save,
    actions: {
      addGame: (game: Game) => {
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
        // 注意：这里假设 devices 结构，根据你的类型定义可能需要调整查找逻辑
        setConfig(
          produce(state => {
            const device = state.devices.find(d => d.uid === deviceUid) // 假设 Device 有 uid
            if (device) {
              // @ts-ignore: 假设 variables 是个 Record 或者 Map
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

// 在 App 入口处调用一次
export { initConfig }

/* usage:

calls initConfig in App.tsx, then use `const { config, actions } = useConfig();` in other components

*/

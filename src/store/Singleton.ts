import { invoke } from '@tauri-apps/api/core'

let _currentDeviceId: null | Promise<string> = null
export const currentDeviceId = (): Promise<string> => {
  _currentDeviceId ??= (async () => {
    try {
      return await invoke<string>('device_id')
    } catch (error) {
      // Reset the cache so the next call retries instead of returning a
      // permanently-rejected promise.
      _currentDeviceId = null
      throw error
    }
  })()
  return _currentDeviceId
}

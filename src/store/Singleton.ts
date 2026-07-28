import { invoke } from '@tauri-apps/api/core'

let _currentDeviceId: null | Promise<string> = null
export const currentDeviceId = (): Promise<string> => {
  if (!_currentDeviceId) {
    _currentDeviceId = invoke<string>('device_id').catch(error => {
      _currentDeviceId = null
      throw error
    })
  }
  return _currentDeviceId
}

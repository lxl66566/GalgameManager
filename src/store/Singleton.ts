import { invoke } from '@tauri-apps/api/core'

let _currentDeviceId: Promise<string> | null = null
export const currentDeviceId = (): Promise<string> => {
  if (!_currentDeviceId) {
    _currentDeviceId = invoke<string>('device_id').catch(err => {
      _currentDeviceId = null
      throw err
    })
  }
  return _currentDeviceId
}

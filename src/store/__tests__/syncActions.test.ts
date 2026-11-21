/// Guards for "remote storage not configured" in the config store:
/// periodic auto upload and startup auto pull must stay silent, while
/// explicit user actions (manual upload / manual pull) keep surfacing errors.

import type { Config } from '@bindings/Config'
import type { StorageProvider } from '@bindings/StorageProvider'
import type * as i18n from '@solid-primitives/i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Dictionary } from '~/i18n'

type AnyFn = (...args: unknown[]) => unknown

const { invokeMock, myToastMock, toast, toastBase } = vi.hoisted(() => ({
  invokeMock: vi.fn<AnyFn>(),
  myToastMock: vi.fn<AnyFn>(),
  toast: {
    dismiss: vi.fn<AnyFn>(),
    error: vi.fn<AnyFn>(),
    loading: vi.fn<AnyFn>(),
    success: vi.fn<AnyFn>()
  },
  toastBase: vi.fn<AnyFn>()
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@components/ui/myToast', () => ({ myToast: myToastMock }))
// Real log() fires `invoke('log', ...)` IPC, which would pollute invokeMock.
vi.mock('@utils/log', () => ({
  errToStr: (value: unknown) => (value instanceof Error ? value.message : String(value)),
  log: {
    error: vi.fn<AnyFn>(),
    info: vi.fn<AnyFn>(),
    warn: vi.fn<AnyFn>()
  }
}))
vi.mock('solid-toast', () => ({
  default: Object.assign(toastBase, {
    dismiss: toast.dismiss,
    error: toast.error,
    loading: toast.loading,
    success: toast.success
  })
}))

const t = ((key: unknown) => String(key)) as unknown as i18n.Translator<Dictionary>

// Fresh store import per test: the module reads `__INITIAL_CONFIG__` once at
// import time to build the singleton config store.
const loadStore = async (provider: StorageProvider) => {
  vi.resetModules()
  globalThis.__INITIAL_CONFIG__ = {
    settings: { storage: { provider } }
  } as unknown as Config
  return await import('~/store')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('performAutoUpload', () => {
  it('skips silently when storage provider is none', async () => {
    const { performAutoUpload } = await loadStore('none')
    await performAutoUpload(t)
    expect(invokeMock).not.toHaveBeenCalled()
    expect(toastBase).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('uploads and toasts success when configured', async () => {
    invokeMock.mockResolvedValue('uploaded')
    const { performAutoUpload } = await loadStore('webDav')
    await performAutoUpload(t)
    expect(invokeMock).toHaveBeenCalledWith('upload_config', { safe: true })
    expect(toast.success).toHaveBeenCalledOnce()
  })
})

describe('performManualUpload', () => {
  it('still reports errors for explicit user actions when unconfigured', async () => {
    invokeMock.mockRejectedValue(new Error('Storage provider not set'))
    const { performManualUpload } = await loadStore('none')
    await performManualUpload(t)
    expect(invokeMock).toHaveBeenCalledWith('upload_config', { safe: false })
    expect(toast.error).toHaveBeenCalledOnce()
  })
})

describe('checkAndPullRemote', () => {
  it('stays silent on startup auto-pull when unconfigured', async () => {
    const { checkAndPullRemote } = await loadStore('none')
    await checkAndPullRemote(t)
    expect(invokeMock).not.toHaveBeenCalled()
    expect(toastBase).not.toHaveBeenCalled()
    expect(myToastMock).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('manual pull proceeds and surfaces missing remote config', async () => {
    invokeMock.mockResolvedValue([null, true])
    const { checkAndPullRemote } = await loadStore('webDav')
    await checkAndPullRemote(t, true)
    expect(invokeMock).toHaveBeenCalledWith('apply_remote_config', { safe: false })
    expect(toast.error).toHaveBeenCalledOnce()
  })
})

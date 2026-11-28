/// Guards for the update check: automatic checks stay silent unless a newer
/// release exists, while the explicit check reports every outcome.

import type { Config } from '@bindings/Config'
import type { UpdateStatus } from '@bindings/UpdateStatus'
import type { CustomToastOptions } from '@components/ui/myToast'
import type * as i18n from '@solid-primitives/i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Dictionary } from '~/i18n'
import { dict as enUS } from '~/i18n/en-US'

type AnyFn = (...args: unknown[]) => unknown

const { invokeMock, logWarn, myToastMock, openUrlMock, toast, toastBase } = vi.hoisted(
  () => ({
    invokeMock: vi.fn<AnyFn>(),
    logWarn: vi.fn<AnyFn>(),
    myToastMock: vi.fn<(props: CustomToastOptions) => void>(),
    openUrlMock: vi.fn<AnyFn>(),
    toast: {
      dismiss: vi.fn<AnyFn>(),
      error: vi.fn<AnyFn>(),
      loading: vi.fn<AnyFn>(),
      success: vi.fn<AnyFn>()
    },
    toastBase: vi.fn<AnyFn>()
  })
)

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: openUrlMock }))
vi.mock('@components/ui/myToast', () => ({ myToast: myToastMock }))
// Real log() fires `invoke('log', ...)` IPC, which would pollute invokeMock.
vi.mock('@utils/log', () => ({
  errToStr: (value: unknown) => (value instanceof Error ? value.message : String(value)),
  log: {
    error: vi.fn<AnyFn>(),
    info: vi.fn<AnyFn>(),
    warn: logWarn
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

const UPDATE_TOAST_ID = 'app-update'

// Echoes the key, so assertions stay independent of wording, but only after
// resolving it against the real dictionary: a mistyped key fails here instead
// of reaching users as a raw key.
const t = ((key: string) => {
  const entry = key.split('.').reduce<unknown>((node, seg) => {
    if (typeof node !== 'object' || node === null) return undefined
    return (node as Record<string, unknown>)[seg]
  }, enUS)
  if (typeof entry !== 'string') throw new Error(`missing i18n key: ${key}`)
  return key
}) as unknown as i18n.Translator<Dictionary>

const AVAILABLE: UpdateStatus = {
  current: '1.4.4',
  latestVersion: 'v1.5.0',
  type: 'available',
  url: 'https://github.com/lxl66566/GalgameManager/releases/tag/v1.5.0'
}

const UP_TO_DATE: UpdateStatus = { current: '1.4.4', type: 'upToDate' }

// Fresh import per test: the config store singleton is built from
// `__INITIAL_CONFIG__` when `~/store` is first imported.
const loadUpdateCheck = async (autoCheckUpdate: boolean) => {
  vi.resetModules()
  globalThis.__INITIAL_CONFIG__ = {
    settings: { autoCheckUpdate }
  } as unknown as Config
  return await import('~/store/updateCheck')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('autoCheckUpdate', () => {
  it('does nothing while the setting is off', async () => {
    const { autoCheckUpdate } = await loadUpdateCheck(false)
    await autoCheckUpdate(t)
    expect(invokeMock).not.toHaveBeenCalled()
    expect(myToastMock).not.toHaveBeenCalled()
    expect(toastBase).not.toHaveBeenCalled()
  })

  it('offers the release page when a newer version exists', async () => {
    invokeMock.mockResolvedValue(AVAILABLE)
    const { autoCheckUpdate } = await loadUpdateCheck(true)
    await autoCheckUpdate(t)
    expect(invokeMock).toHaveBeenCalledWith('check_update')

    const [props] = myToastMock.mock.calls[0] ?? []
    expect(props?.message).toBe('hint.updateAvailable')
    expect(props?.toastId).toBe(UPDATE_TOAST_ID)
    props?.actions?.[0]?.onClick?.()
    expect(openUrlMock).toHaveBeenCalledWith(AVAILABLE.url)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('stays silent when up to date and when the check fails', async () => {
    invokeMock
      .mockResolvedValueOnce(UP_TO_DATE)
      .mockRejectedValueOnce(new Error('HTTP 403'))
    const { autoCheckUpdate } = await loadUpdateCheck(true)
    await autoCheckUpdate(t)
    await autoCheckUpdate(t)
    expect(myToastMock).not.toHaveBeenCalled()
    expect(toastBase).not.toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalledOnce()
  })
})

describe('manualCheckUpdate', () => {
  it('replaces the loading toast with the result', async () => {
    invokeMock.mockResolvedValueOnce(UP_TO_DATE).mockResolvedValueOnce(AVAILABLE)
    const { manualCheckUpdate } = await loadUpdateCheck(false)
    await manualCheckUpdate(t)
    await manualCheckUpdate(t)

    expect(toast.loading).toHaveBeenCalledWith('hint.checkingUpdate', {
      id: UPDATE_TOAST_ID
    })
    expect(toast.success).toHaveBeenCalledWith('hint.updateUpToDate', {
      id: UPDATE_TOAST_ID
    })
    expect(myToastMock).toHaveBeenCalledOnce()
    expect(myToastMock.mock.calls[0]?.[0].toastId).toBe(UPDATE_TOAST_ID)
  })

  it('reports a failed check', async () => {
    invokeMock.mockRejectedValueOnce(new Error('boom'))
    const { manualCheckUpdate } = await loadUpdateCheck(false)
    await manualCheckUpdate(t)
    expect(toast.error).toHaveBeenCalledWith('hint.checkUpdateFailed: boom', {
      id: UPDATE_TOAST_ID
    })
  })
})

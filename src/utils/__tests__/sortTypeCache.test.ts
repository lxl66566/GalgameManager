import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { Home: 'Home' },
  readTextFile: vi.fn<(path: string, options?: unknown) => Promise<string>>(),
  writeTextFile: vi.fn<
    (path: string, contents: string, options?: unknown) => Promise<void>
  >(() => Promise.resolve())
}))

// The sort type cache is module-level state, so each test re-imports a fresh
// module instance (via vi.resetModules) to avoid cross-test leakage.
async function loadModule() {
  vi.resetModules()
  const fs = await import('@tauri-apps/plugin-fs')
  // Mocked module instances survive vi.resetModules, so call history and
  // implementations must be reset explicitly.
  vi.mocked(fs.readTextFile).mockReset()
  vi.mocked(fs.writeTextFile).mockReset().mockResolvedValue(undefined)
  const mod = await import('@utils/sortTypeCache')
  return { fs, mod }
}

describe('sortTypeCache', () => {
  it('loads the persisted sort type once and caches it', async () => {
    const { fs, mod } = await loadModule()
    vi.mocked(fs.readTextFile).mockResolvedValue('playTime')

    await expect(mod.getSortType()).resolves.toBe('playTime')
    await expect(mod.getSortType()).resolves.toBe('playTime')
    expect(fs.readTextFile).toHaveBeenCalledTimes(1)
  })

  it('falls back to the default when the read fails', async () => {
    const { fs, mod } = await loadModule()
    vi.mocked(fs.readTextFile).mockRejectedValue(new Error('not found'))

    await expect(mod.getSortType()).resolves.toBe('id')
  })

  it('falls back to the default when the persisted value is invalid', async () => {
    const { fs, mod } = await loadModule()
    vi.mocked(fs.readTextFile).mockResolvedValue('bogus')

    await expect(mod.getSortType()).resolves.toBe('id')
  })

  it('setSortType updates the cache immediately and persists to disk', async () => {
    const { fs, mod } = await loadModule()
    vi.mocked(fs.readTextFile).mockResolvedValue('id')

    mod.setSortType('lastPlayed')

    await expect(mod.getSortType()).resolves.toBe('lastPlayed')
    // The cache is already populated, so no disk read happens.
    expect(fs.readTextFile).not.toHaveBeenCalled()
    expect(fs.writeTextFile).toHaveBeenCalledWith(
      expect.any(String),
      'lastPlayed',
      expect.anything()
    )
  })

  it('does not let a slow disk read overwrite a newer user selection', async () => {
    const { fs, mod } = await loadModule()
    let resolveRead: ((value: string) => void) | undefined
    vi.mocked(fs.readTextFile).mockImplementation(
      () =>
        new Promise<string>(resolve => {
          resolveRead = resolve
        })
    )

    const pending = mod.getSortType()
    // The user picks a new sort type while the initial disk read is in flight.
    mod.setSortType('name')
    // The stale disk value resolves afterwards and must not win.
    resolveRead?.('id')

    await expect(pending).resolves.toBe('name')
    await expect(mod.getSortType()).resolves.toBe('name')
  })
})

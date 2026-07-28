import type { Device } from '@bindings/Device'
import type { Game } from '@bindings/Game'
import {
  appendDeviceOp,
  appendGameOp,
  applyPatch,
  deleteDeviceOp,
  deleteGameOp,
  diffGame,
  expandPatch,
  mergeConfigPatches,
  modifyDeviceOp,
  modifyGameOp,
  type ConfigPatch
} from '@utils/patch'
import { describe, expect, it } from 'vitest'

// Minimal game factory — only the fields diffGame touches need realistic
// values; the rest default via `as Game`.
function game(id: number, over: Partial<Game> = {}): Game {
  return {
    addedTime: '2024-01-01T00:00:00Z',
    coverColor: null,
    excutablePath: null,
    id,
    imageSha256: null,
    imageUrl: null,
    lastPlayedTime: null,
    lastUploadTime: null,
    name: `g${id}`,
    plugins: [],
    savePaths: [],
    useTime: [0, 0],
    ...over
  }
}

describe('diffGame', () => {
  it('returns an empty patch when nothing changed', () => {
    expect(diffGame(game(1), game(1))).toEqual({})
  })

  it('only includes changed fields', () => {
    const patch = diffGame(
      game(1, { name: 'old', useTime: [100, 0] }),
      game(1, { name: 'new', useTime: [100, 0] })
    )
    expect(patch).toEqual({ name: 'new' })
  })

  it('ignores backend-owned fields when they are identical on both sides', () => {
    // This is the race fix: the game loop's use_time advances on the backend
    // only, so both diff inputs carry the same stale value and the field
    // never lands in the patch.
    const patch = diffGame(game(1, { useTime: [100, 0] }), game(1, { useTime: [100, 0] }))
    expect(patch.useTime).toBeUndefined()
  })

  it('detects useTime tuple changes', () => {
    // useTime is [secs, nanos] — JSON.stringify tuple comparison.
    const patch = diffGame(game(1, { useTime: [100, 0] }), game(1, { useTime: [200, 0] }))
    expect(patch.useTime).toEqual([200, 0])
  })

  it('captures clearing a nullable field (coverColor: null vs string)', () => {
    const patch = diffGame(
      game(1, { coverColor: '#ff0000' }),
      game(1, { coverColor: null })
    )
    expect(patch.coverColor).toBeNull()
  })
})

// ── Direct-patch builders ───────────────────────────────────────────────────
//
// These exercise the helpers that "know-what-they-changed" callers use to
// skip the diffConfig path. Keep them in sync with the Rust ListPatchOp
// shape so the wire format stays stable.

describe('appendGameOp / deleteGameOp / modifyGameOp', () => {
  it('appendGameOp wraps the game in an Append op', () => {
    const g = game(7, { name: 'seven' })
    expect(appendGameOp(g)).toEqual({ games: [{ op: 'append', value: g }] })
  })

  it('deleteGameOp only carries the id', () => {
    expect(deleteGameOp(42)).toEqual({ games: [{ id: 42, op: 'delete' }] })
  })

  it('modifyGameOp wraps the sub-patch with the id', () => {
    expect(modifyGameOp(3, { name: 'three' })).toEqual({
      games: [{ id: 3, op: 'modify', value: { name: 'three' } }]
    })
  })
})

describe('mergeConfigPatches', () => {
  it('concatenates games ops from both sides', () => {
    const a = appendGameOp(game(1))
    const b = deleteGameOp(2)
    const merged = mergeConfigPatches(a, b)
    expect(merged.games).toHaveLength(2)
    expect(merged.games![0].op).toBe('append')
    expect(merged.games![1].op).toBe('delete')
  })

  it('latest wins for the same nested key', () => {
    // Cast: we only care about merge semantics here, not Settings shape.
    const a = { settings: { v: 1 } } as unknown as ConfigPatch
    const b = { settings: { v: 2 } } as unknown as ConfigPatch
    expect(mergeConfigPatches(a, b).settings).toEqual({ v: 2 })
  })

  it('deep-merges sibling nested patches (debounce coalescing must not drop edits)', () => {
    // Regression test: two debounced updates within one window — e.g. typing
    // a webdav endpoint, then a username — used to lose the first patch to a
    // shallow {...a, ...b} merge, diverging the store from the backend.
    const a = {
      settings: { storage: { webdav: { endpoint: 'https://a' } } }
    } as unknown as ConfigPatch
    const b = {
      settings: { storage: { webdav: { username: 'u' } } }
    } as unknown as ConfigPatch
    expect(mergeConfigPatches(a, b).settings).toEqual({
      storage: { webdav: { endpoint: 'https://a', username: 'u' } }
    })
  })

  it('merges independently-set fields', () => {
    const a = { settings: { v: 1 } } as unknown as ConfigPatch
    const b = { devices: [{ uid: 'x' }] } as unknown as ConfigPatch
    const merged = mergeConfigPatches(a, b)
    expect(merged.settings).toEqual({ v: 1 })
    expect(merged.devices).toEqual([{ uid: 'x' }])
  })

  it('games from one side pass through unchanged when the other has none', () => {
    const a = appendGameOp(game(1))
    const b = { settings: { v: 1 } } as unknown as ConfigPatch
    const merged = mergeConfigPatches(a, b)
    expect(merged.games).toHaveLength(1)
    expect(merged.settings).toEqual({ v: 1 })
  })
})

// ── applyPatch: optimistic store merge ───────────────────────────────────────
//
// applyPatch is the core of the declarative store actions: it takes a
// `SettingsPatch` (or `PluginMetadatasPatch`, etc.) and merges it into the
// SolidJS store draft **before** the IPC roundtrip completes.  It must mirror
// struct-patch's semantics: plain objects recurse, everything else (primitives,
// arrays, null) replaces in-place, and undefined is skipped.

describe('applyPatch', () => {
  it('replaces a leaf value', () => {
    const t = { lang: 'en', theme: 'light' }
    applyPatch(t, { theme: 'dark' })
    expect(t).toEqual({ lang: 'en', theme: 'dark' })
  })

  it('recurses into nested plain objects (2 levels)', () => {
    const t = { appearance: { lang: 'en', theme: 'light' }, launch: { mode: true } }
    applyPatch(t, { appearance: { theme: 'dark' } })
    expect(t).toEqual({
      appearance: { lang: 'en', theme: 'dark' },
      launch: { mode: true }
    })
  })

  it('recurses into three levels of nesting', () => {
    // This mirrors the deepest real-world path: settings.storage.local.path.
    const t = { storage: { local: { operator: 'x', path: '/old' }, provider: 'local' } }
    applyPatch(t, { storage: { local: { path: '/new' } } })
    expect(t).toEqual({
      storage: { local: { operator: 'x', path: '/new' }, provider: 'local' }
    })
  })

  it('replaces arrays wholesale (they are leaves in struct-patch)', () => {
    const t = { games: [{ id: 1, name: 'g1' }], tags: ['a', 'b'] }
    applyPatch(t, { games: [{ id: 2, name: 'g2' }] })
    // The entire array is replaced, not merged element-by-element.
    expect(t.games).toEqual([{ id: 2, name: 'g2' }])
  })

  it('assigns null (distinct from undefined — means "clear")', () => {
    const t = { coverColor: '#ff0000', name: 'test' }
    applyPatch(t, { coverColor: null })
    expect(t.coverColor).toBeNull()
    expect(t.name).toBe('test')
  })

  it('skips undefined values (means "no change")', () => {
    const t = { lang: 'en', theme: 'light' }
    applyPatch(t, { lang: undefined, theme: 'dark' })
    // lang is unchanged because the patch carried undefined.
    expect(t).toEqual({ lang: 'en', theme: 'dark' })
  })

  it('does nothing when target is not a plain object', () => {
    const array = [1, 2, 3]
    applyPatch(array as unknown as Record<string, unknown>, { 0: 99 })
    // Arrays should be left untouched — applyPatch only operates on plain objects.
    expect(array).toEqual([1, 2, 3])
  })

  it('does nothing on null/undefined target', () => {
    expect(() => {
      applyPatch(null as unknown as Record<string, unknown>, { a: 1 })
    }).not.toThrow()
    expect(() => {
      applyPatch(undefined as unknown as Record<string, unknown>, { a: 1 })
    }).not.toThrow()
  })

  it('branch-merges at multiple keys simultaneously', () => {
    const t = { a: { x: 1 }, b: { y: 2 }, c: 3 }
    applyPatch(t, { a: { x: 99 }, b: { y: 100 } })
    expect(t.a.x).toBe(99)
    expect(t.b.y).toBe(100)
    expect(t.c).toBe(3)
  })

  it('overwrites a nested object entirely when patch value is not a plain object', () => {
    const t = { nested: { a: 1, b: 2 }, other: 'keep' }
    // If the patch carries a Date (not a plain object) for a key whose target
    // value IS a plain object, we should replace, not recurse.
    applyPatch(t, { nested: 'boom' })
    expect(t.nested).toBe('boom')
    expect(t.other).toBe('keep')
  })

  it('empty patch does nothing', () => {
    const t = { a: 1, b: { c: 2 } }
    applyPatch(t, {})
    expect(t).toEqual({ a: 1, b: { c: 2 } })
  })
})

// ── expandPatch: partial → whole-sub-object wire form ─────────────────────
//
// Settings/plugin-metadatas sub-structs are whole-replacement on the Rust
// side, so the declarative partials accepted by updateSettings must be
// expanded against the current store value before hitting the wire.

describe('expandPatch', () => {
  it('expands a nested partial into the full sub-struct', () => {
    const base = {
      launch: { dailyStat: true, precisionMode: true },
      storage: { provider: 'webdav', webdav: { endpoint: 'https://a', username: 'old' } }
    }
    const patch = { storage: { webdav: { username: 'new' } } }
    expect(expandPatch(base, patch)).toEqual({
      storage: { provider: 'webdav', webdav: { endpoint: 'https://a', username: 'new' } }
    })
  })

  it('passes scalars through unchanged', () => {
    const base = { autoSyncInterval: 1200, launch: { dailyStat: true } }
    expect(expandPatch(base, { autoSyncInterval: 600 })).toEqual({
      autoSyncInterval: 600
    })
  })

  it('does not mutate the base object', () => {
    const base = { launch: { dailyStat: true, precisionMode: true } }
    expandPatch(base, { launch: { dailyStat: false } })
    expect(base.launch.dailyStat).toBe(true)
  })

  it('replaces (not merges) array leaves inside an expanded sub-struct', () => {
    const base = { meta: { flag: true, list: [1, 2, 3] } }
    expect(expandPatch(base, { meta: { list: [9] } })).toEqual({
      meta: { flag: true, list: [9] }
    })
  })
})

// ── Device list-patch builders ──────────────────────────────────────────────

describe('appendDeviceOp / deleteDeviceOp / modifyDeviceOp', () => {
  const device = {
    name: 'Dev 1',
    uid: 'dev-1',
    variables: { PATH: '/usr/bin' }
  } as Device

  it('appendDeviceOp wraps the device in an Append op', () => {
    expect(appendDeviceOp(device)).toEqual({
      devices: [{ op: 'append', value: device }]
    })
  })

  it('deleteDeviceOp only carries the uid', () => {
    expect(deleteDeviceOp('dev-1')).toEqual({
      devices: [{ id: 'dev-1', op: 'delete' }]
    })
  })

  it('modifyDeviceOp wraps the sub-patch with the uid', () => {
    expect(modifyDeviceOp('dev-1', { name: 'Renamed' })).toEqual({
      devices: [{ id: 'dev-1', op: 'modify', value: { name: 'Renamed' } }]
    })
  })
})

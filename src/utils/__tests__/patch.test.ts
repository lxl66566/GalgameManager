import { describe, expect, it } from 'vitest'
import type { ConfigLike, ConfigPatch, GameListOp } from '@utils/patch'
import {
  appendGameOp,
  applyPatch,
  deleteDeviceOp,
  deleteGameOp,
  diffConfig,
  mergeConfigPatches,
  modifyDeviceOp,
  modifyGameOp,
  appendDeviceOp,
} from '@utils/patch'
import type { Device } from '@bindings/Device'
import type { Game } from '@bindings/Game'

// Minimal game factory — only the fields diffConfig touches need realistic
// values; the rest default via `as Game`.
function game(id: number, over: Partial<Game> = {}): Game {
  return {
    id,
    name: `g${id}`,
    excutablePath: null,
    savePaths: [],
    imageUrl: null,
    imageSha256: null,
    addedTime: '2024-01-01T00:00:00Z',
    useTime: [0, 0],
    lastPlayedTime: null,
    lastUploadTime: null,
    coverColor: null,
    plugins: [],
    ...over,
  } as Game
}

// Build a minimal ConfigLike for tests.
function config(games: Game[], over: Partial<ConfigLike> = {}): ConfigLike {
  return {
    games,
    devices: [],
    settings: { storage: { provider: 'none' } },
    pluginMetadatas: {},
    ...over,
  }
}

describe('diffConfig', () => {
  it('returns null when nothing changed', () => {
    const c = config([game(1)])
    expect(diffConfig(c, c)).toBeNull()
  })

  it('emits a single modify op for one changed field', () => {
    const base = config([game(1, { name: 'old', useTime: [100, 0] })])
    const cur = config([game(1, { name: 'new', useTime: [100, 0] })])
    const patch = diffConfig(base, cur)!
    expect(patch.games).toHaveLength(1)
    const op = patch.games![0] as Extract<GameListOp, { op: 'modify' }>
    expect(op.op).toBe('modify')
    expect(op.id).toBe(1)
    // Only the changed field is in the sub-patch.
    expect(op.value).toEqual({ name: 'new' })
  })

  it('does NOT include unchanged games in the patch (daily_playtime stays home)', () => {
    // This is the bandwidth win: editing game 1 must not ship game 2's
    // large dailyPlaytime HashMap over IPC.
    const base = config([
      game(1, { name: 'g1' }),
      game(2, { dailyPlaytime: { '2024-01-01': 9999 } }),
    ])
    const cur = config([
      game(1, { name: 'g1-edited' }),
      game(2, { dailyPlaytime: { '2024-01-01': 9999 } }),
    ])
    const patch = diffConfig(base, cur)!
    expect(patch.games).toHaveLength(1)
    expect((patch.games![0] as Extract<GameListOp, { op: 'modify' }>).id).toBe(1)
  })

  it('emits append for a newly added game', () => {
    const base = config([game(1)])
    const cur = config([game(1), game(2, { name: 'new' })])
    const patch = diffConfig(base, cur)!
    const appended = patch.games!.find(
      o => o.op === 'append'
    ) as Extract<GameListOp, { op: 'append' }>
    expect(appended.value.id).toBe(2)
  })

  it('emits delete for a removed game', () => {
    const base = config([game(1), game(2)])
    const cur = config([game(1)])
    const patch = diffConfig(base, cur)!
    expect(patch.games).toEqual([{ op: 'delete', id: 2 }])
  })

  it('coalesces modify + delete across games into one ops list', () => {
    const base = config([game(1, { name: 'a' }), game(2), game(3)])
    const cur = config([game(1, { name: 'a2' }), game(3)])
    const patch = diffConfig(base, cur)!
    const ops = patch.games!
    expect(ops).toHaveLength(2)
    expect(ops.some(o => o.op === 'modify' && o.id === 1)).toBe(true)
    expect(ops.some(o => o.op === 'delete' && o.id === 2)).toBe(true)
  })

  it('ships the whole devices/settings/pluginMetadatas when changed', () => {
    const base = config([game(1)], { devices: [{ uid: 'a', name: 'A', variables: {} }] })
    const cur = config([game(1)], { devices: [{ uid: 'a', name: 'A2', variables: {} }] })
    const patch = diffConfig(base, cur)!
    expect(patch.devices).toEqual(cur.devices)
    expect(patch.games).toBeUndefined()
  })

  it('detects nested useTime tuple changes', () => {
    // useTime is [secs, nanos] — JSON.stringify tuple comparison.
    const base = config([game(1, { useTime: [100, 0] })])
    const cur = config([game(1, { useTime: [200, 0] })])
    const patch = diffConfig(base, cur)!
    const op = patch.games![0] as Extract<GameListOp, { op: 'modify' }>
    expect(op.value.useTime).toEqual([200, 0])
  })

  it('clearing a nullable field (coverColor: null vs string) is captured', () => {
    const base = config([game(1, { coverColor: '#ff0000' })])
    const cur = config([game(1, { coverColor: null })])
    const patch = diffConfig(base, cur)!
    const op = patch.games![0] as Extract<GameListOp, { op: 'modify' }>
    expect(op.value.coverColor).toBeNull()
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
    expect(deleteGameOp(42)).toEqual({ games: [{ op: 'delete', id: 42 }] })
  })

  it('modifyGameOp wraps the sub-patch with the id', () => {
    expect(modifyGameOp(3, { name: 'three' })).toEqual({
      games: [{ op: 'modify', id: 3, value: { name: 'three' } }],
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
      settings: { storage: { webdav: { endpoint: 'https://a' } } },
    } as unknown as ConfigPatch
    const b = {
      settings: { storage: { webdav: { username: 'u' } } },
    } as unknown as ConfigPatch
    expect(mergeConfigPatches(a, b).settings).toEqual({
      storage: { webdav: { endpoint: 'https://a', username: 'u' } },
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
    const t = { theme: 'light', lang: 'en' }
    applyPatch(t, { theme: 'dark' })
    expect(t).toEqual({ theme: 'dark', lang: 'en' })
  })

  it('recurses into nested plain objects (2 levels)', () => {
    const t = { appearance: { theme: 'light', lang: 'en' }, launch: { mode: true } }
    applyPatch(t, { appearance: { theme: 'dark' } })
    expect(t).toEqual({ appearance: { theme: 'dark', lang: 'en' }, launch: { mode: true } })
  })

  it('recurses into three levels of nesting', () => {
    // This mirrors the deepest real-world path: settings.storage.local.path.
    const t = { storage: { local: { path: '/old', operator: 'x' }, provider: 'local' } }
    applyPatch(t, { storage: { local: { path: '/new' } } })
    expect(t).toEqual({ storage: { local: { path: '/new', operator: 'x' }, provider: 'local' } })
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
    const t = { theme: 'light', lang: 'en' }
    applyPatch(t, { theme: 'dark', lang: undefined })
    // lang is unchanged because the patch carried undefined.
    expect(t).toEqual({ theme: 'dark', lang: 'en' })
  })

  it('does nothing when target is not a plain object', () => {
    const arr = [1, 2, 3]
    applyPatch(arr, { 0: 99 } as unknown as Record<string, unknown>)
    // Arrays should be left untouched — applyPatch only operates on plain objects.
    expect(arr).toEqual([1, 2, 3])
  })

  it('does nothing on null/undefined target', () => {
    expect(() => applyPatch(null as unknown as Record<string, unknown>, { a: 1 })).not.toThrow()
    expect(() => applyPatch(undefined as unknown as Record<string, unknown>, { a: 1 })).not.toThrow()
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
    applyPatch(t, { nested: 'boom' as unknown as Record<string, unknown> })
    expect(t.nested).toBe('boom')
    expect(t.other).toBe('keep')
  })

  it('empty patch does nothing', () => {
    const t = { a: 1, b: { c: 2 } }
    applyPatch(t, {})
    expect(t).toEqual({ a: 1, b: { c: 2 } })
  })
})

// ── Device list-patch builders ──────────────────────────────────────────────

describe('appendDeviceOp / deleteDeviceOp / modifyDeviceOp', () => {
  const device = { uid: 'dev-1', name: 'Dev 1', variables: { PATH: '/usr/bin' } } as Device

  it('appendDeviceOp wraps the device in an Append op', () => {
    expect(appendDeviceOp(device)).toEqual({
      devices: [{ op: 'append', value: device }],
    })
  })

  it('deleteDeviceOp only carries the uid', () => {
    expect(deleteDeviceOp('dev-1')).toEqual({
      devices: [{ op: 'delete', id: 'dev-1' }],
    })
  })

  it('modifyDeviceOp wraps the sub-patch with the uid', () => {
    expect(modifyDeviceOp('dev-1', { name: 'Renamed' })).toEqual({
      devices: [{ op: 'modify', id: 'dev-1', value: { name: 'Renamed' } }],
    })
  })
})

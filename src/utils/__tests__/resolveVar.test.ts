import { extractUnknownVars, replaceWithVarNames, resolveVar } from '@utils/resolveVar'
import { describe, expect, it } from 'vitest'

describe('resolveVar', () => {
  it('returns input unchanged when no braces present (fast path)', () => {
    expect(resolveVar('plain string', { foo: 'bar' })).toBe('plain string')
    expect(resolveVar('', { foo: 'bar' })).toBe('')
  })

  it('replaces {key} with the corresponding value', () => {
    expect(resolveVar('{name}/{dir}', { name: 'Alice', dir: 'home' })).toBe('Alice/home')
  })

  it('handles the empty-brace placeholder {} (used in plugin commands)', () => {
    // easy_strfmt treats {} as the empty-string key; the frontend mirrors
    // that so commands like `LEProc.exe "{}"` resolve the same way.
    expect(resolveVar('LEProc.exe {}', { '': 'game.exe' })).toBe('LEProc.exe game.exe')
  })

  it('leaves unknown {key} placeholders intact (lenient mode)', () => {
    // Unlike the Rust side (which errors), the frontend tolerates unknown
    // keys so the UI doesn't crash before the device vars are loaded.
    expect(resolveVar('{missing}/path', { foo: 'bar' })).toBe('{missing}/path')
  })

  it('handles escaped `{{` as a literal `{` (note: `}}` is NOT escaped)', () => {
    // The JS impl only special-cases `{{`; `}}` falls through as a regular
    // `}` and, since there is no preceding `{`, ends up emitted literally.
    // This differs from the Rust side which does escape `}}`. Documenting
    // current behaviour here so any future change is caught.
    expect(resolveVar('{{name}}', { name: 'X' })).toBe('{name}}')
    expect(resolveVar('{{ hi', {})).toBe('{ hi')
  })

  it('handles unmatched open brace as literal', () => {
    expect(resolveVar('hello {world', { world: 'X' })).toBe('hello {world')
  })

  it('handles unmatched close brace as literal', () => {
    expect(resolveVar('hello } world', {})).toBe('hello } world')
  })

  it('handles multiple keys in the same string', () => {
    const out = resolveVar('{a}-{b}-{a}', { a: '1', b: '2' })
    expect(out).toBe('1-2-1')
  })

  it('handles values containing special characters', () => {
    expect(resolveVar('{p}', { p: 'C:/Program Files (x86)' })).toBe(
      'C:/Program Files (x86)'
    )
  })
})

describe('replaceWithVarNames', () => {
  it('returns input unchanged for empty path', () => {
    expect(replaceWithVarNames('', { a: 'b' })).toBe('')
  })

  it('returns input unchanged when no variable matches', () => {
    expect(replaceWithVarNames('/some/path', { x: 'y' })).toBe('/some/path')
  })

  it('replaces the first occurrence of the longest matching value', () => {
    // Longest-value-first: `D:/Games/Gal` beats `D:/Games`.
    const vars = {
      short: 'D:/Games',
      long: 'D:/Games/Gal'
    }
    expect(replaceWithVarNames('D:/Games/Gal/save', vars)).toBe('{long}/save')
  })

  it('only replaces the first occurrence', () => {
    expect(replaceWithVarNames('a/a/a/b', { a: 'a' })).toBe('{a}/a/a/b')
  })

  it('skips entries with empty values', () => {
    // Empty values would match position 0 of any string and break things.
    expect(replaceWithVarNames('/path/x', { empty: '', real: '/path' })).toBe('{real}/x')
  })
})

describe('extractUnknownVars', () => {
  it('returns [] when no braces present', () => {
    expect(extractUnknownVars('plain', { a: 'b' })).toEqual([])
  })

  it('lists keys not present in varMap', () => {
    expect(extractUnknownVars('{a}/{b}/{c}', { a: '1', b: '2' })).toEqual(['c'])
  })

  it('returns empty array when all keys are known', () => {
    expect(extractUnknownVars('{a}/{b}', { a: '1', b: '2' })).toEqual([])
  })

  it('deduplicates repeated unknown keys', () => {
    expect(extractUnknownVars('{x}/{x}/{x}', {})).toEqual(['x'])
  })

  it('skips escaped braces {{ }}', () => {
    expect(extractUnknownVars('{{name}}', {})).toEqual([])
  })

  it('skips empty braces {} (positional placeholder)', () => {
    expect(extractUnknownVars('LEProc.exe {}', {})).toEqual([])
  })

  it('greedily matches nested-looking braces as a single key', () => {
    // `{a {b}` → key is `a {b` (everything between first `{` and next `}`).
    // The parser doesn't track nesting — documented here so changes are
    // caught.
    expect(extractUnknownVars('{a {b}', { a: '1' })).toEqual(['a {b'])
  })

  it('stops cleanly on a dangling open brace mid-string', () => {
    // `{a}` parsed → i past `}`; then `{nope` has no closing brace → break.
    expect(extractUnknownVars('{a}{nope', { a: '1' })).toEqual([])
  })
})

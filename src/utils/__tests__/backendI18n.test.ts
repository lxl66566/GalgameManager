import { resolveBackendI18n } from '@utils/backendI18n'
import { describe, expect, it } from 'vitest'

// Minimal translator: returns the looked-up value, or the raw key when the
// dictionary has no entry (mirrors how the real translator falls back).
const dict: Record<string, string> = {
  'a.b': 'AB',
  'hint.ok': 'OK',
  'hint.syncFailed': '同步失败'
}
const t = (key: string): string => dict[key] ?? key

describe('resolveBackendI18n', () => {
  it('replaces a single <key> token with its translation', () => {
    expect(resolveBackendI18n('<hint.ok>', t)).toBe('OK')
  })

  it('keeps text outside the tokens unchanged', () => {
    expect(resolveBackendI18n('AutoUpload: <hint.syncFailed>game X', t)).toBe(
      'AutoUpload: 同步失败game X'
    )
  })

  it('replaces multiple tokens in one string', () => {
    expect(resolveBackendI18n('<hint.ok> and <a.b>', t)).toBe('OK and AB')
  })

  it('returns the key itself when the dictionary has no entry', () => {
    expect(resolveBackendI18n('<hint.unknown>', t)).toBe('hint.unknown')
  })

  it('leaves strings without tokens untouched', () => {
    expect(resolveBackendI18n('plain message', t)).toBe('plain message')
  })

  it('leaves unclosed tags untouched', () => {
    expect(resolveBackendI18n('hello <hint.ok world', t)).toBe('hello <hint.ok world')
  })

  it('does not match tokens with characters outside [A-Za-z0-9._]', () => {
    // spaces, slashes, etc. inside <> are not treated as i18n keys
    expect(resolveBackendI18n('<not a key>', t)).toBe('<not a key>')
    expect(resolveBackendI18n('<a/b>', t)).toBe('<a/b>')
  })

  it('handles empty input', () => {
    expect(resolveBackendI18n('', t)).toBe('')
  })
})

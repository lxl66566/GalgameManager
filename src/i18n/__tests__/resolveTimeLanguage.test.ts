import { resolveTimeLanguage } from '~/i18n'
import { describe, expect, it } from 'vitest'

describe('resolveTimeLanguage', () => {
  it('returns en-US when override is "en"', () => {
    expect(resolveTimeLanguage('en', 'en-US')).toBe('en-US')
    expect(resolveTimeLanguage('en', 'zh-CN')).toBe('en-US')
  })

  it('returns zh-CN when override is "zh"', () => {
    expect(resolveTimeLanguage('zh', 'en-US')).toBe('zh-CN')
    expect(resolveTimeLanguage('zh', 'zh-CN')).toBe('zh-CN')
  })

  it('falls back to the global locale when override is "auto"', () => {
    expect(resolveTimeLanguage('auto', 'en-US')).toBe('en-US')
    expect(resolveTimeLanguage('auto', 'zh-CN')).toBe('zh-CN')
  })
})

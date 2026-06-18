import { formatBytes } from '@utils/file'
import { describe, expect, it } from 'vitest'

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0n)).toBe('0 B')
  })

  it('formats sub-KB values in B', () => {
    expect(formatBytes(512n)).toBe('512 B')
  })

  it('formats KB values', () => {
    expect(formatBytes(1024n)).toBe('1 KB')
    expect(formatBytes(1536n)).toBe('1.5 KB')
  })

  it('formats MB values', () => {
    expect(formatBytes(1024n * 1024n)).toBe('1 MB')
    expect(formatBytes(1024n * 1024n * 5n)).toBe('5 MB')
  })

  it('formats GB values', () => {
    expect(formatBytes(1024n ** 3n)).toBe('1 GB')
  })

  it('respects the decimals parameter', () => {
    expect(formatBytes(1500n, 2)).toBe('1.46 KB')
    expect(formatBytes(1500n, 0)).toBe('1 KB')
  })

  it('clamps negative decimals to 0', () => {
    expect(formatBytes(1500n, -3)).toBe('1 KB')
  })

  it('handles very large values (TB)', () => {
    expect(formatBytes(1024n ** 4n)).toBe('1 TB')
  })
})

import { isDuplicateArchiveName } from '@utils/archiveName'
import { describe, expect, it } from 'vitest'

describe('isDuplicateArchiveName', () => {
  it('allows a case-only rename of the archive itself', () => {
    expect(isDuplicateArchiveName(['a.zip', 'b.zip'], 'a.zip', 'A.zip')).toBe(false)
  })

  it('rejects a name colliding with another archive, ignoring case', () => {
    expect(isDuplicateArchiveName(['a.zip', 'B.zip'], 'a.zip', 'b.zip')).toBe(true)
  })

  it('rejects an exact collision with another archive', () => {
    expect(isDuplicateArchiveName(['a.zip', 'b.zip'], 'a.zip', 'b.zip')).toBe(true)
  })

  it('allows a name used by no archive', () => {
    expect(isDuplicateArchiveName(['a.zip', 'b.zip'], 'a.zip', 'c.zip')).toBe(false)
  })

  it('allows keeping the same name (the UI treats this as a no-op anyway)', () => {
    expect(isDuplicateArchiveName(['a.zip'], 'a.zip', 'a.zip')).toBe(false)
  })

  it('rejects a case-only swap onto a sibling that only differs in case', () => {
    expect(isDuplicateArchiveName(['a.zip', 'b.zip'], 'a.zip', 'B.ZIP')).toBe(true)
  })
})

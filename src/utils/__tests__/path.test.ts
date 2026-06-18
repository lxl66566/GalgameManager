import { fuckBackslash, getParentPath, isAbsolutePath } from '@utils/path'
import { describe, expect, it } from 'vitest'

describe('fuckBackslash', () => {
  it('replaces backslashes with forward slashes', () => {
    expect(fuckBackslash('C:\\Users\\foo')).toBe('C:/Users/foo')
  })
  it('handles mixed separators', () => {
    expect(fuckBackslash('a\\b/c\\d')).toBe('a/b/c/d')
  })
  it('handles empty string', () => {
    expect(fuckBackslash('')).toBe('')
  })
  it('does not touch strings without backslashes', () => {
    expect(fuckBackslash('a/b/c')).toBe('a/b/c')
  })
})

describe('isAbsolutePath', () => {
  it('detects unix absolute paths', () => {
    expect(isAbsolutePath('/usr/bin')).toBe(true)
  })
  it('detects windows drive-letter paths', () => {
    expect(isAbsolutePath('C:\\foo')).toBe(true)
    expect(isAbsolutePath('D:/bar')).toBe(true)
  })
  it('detects UNC paths', () => {
    expect(isAbsolutePath('\\\\server\\share')).toBe(true)
  })
  it('rejects relative paths', () => {
    expect(isAbsolutePath('foo/bar')).toBe(false)
    expect(isAbsolutePath('./foo')).toBe(false)
    expect(isAbsolutePath('')).toBe(false)
  })
})

describe('getParentPath', () => {
  it('returns undefined for empty / root-only inputs', () => {
    expect(getParentPath('')).toBeUndefined()
    expect(getParentPath('/')).toBeUndefined()
    expect(getParentPath('\\')).toBeUndefined()
    expect(getParentPath('//')).toBeUndefined()
  })

  it('returns undefined for windows drive root', () => {
    expect(getParentPath('C:/')).toBeUndefined()
    expect(getParentPath('D:\\')).toBeUndefined()
  })

  it('returns undefined for UNC roots (//server/share)', () => {
    expect(getParentPath('//server/share')).toBeUndefined()
    expect(getParentPath('//server/share/')).toBeUndefined()
  })

  it('returns undefined for bare filename (no slash)', () => {
    expect(getParentPath('foo.txt')).toBeUndefined()
    expect(getParentPath('foo')).toBeUndefined()
  })

  it('extracts the parent dir name (not the full path)', () => {
    // The function returns the last directory NAME, not the full path
    // — matches how the UI uses it (shows just the segment).
    expect(getParentPath('/a/b/c')).toBe('b')
    expect(getParentPath('C:/games/foo/bar')).toBe('foo')
  })

  it('returns undefined when the parent prefix is empty (single-segment unix path)', () => {
    // `/a` -> parent is "" -> undefined
    expect(getParentPath('/a')).toBeUndefined()
  })

  it('returns the first segment when it is non-root', () => {
    expect(getParentPath('foo/bar')).toBe('foo')
  })

  it('normalises backslashes before processing', () => {
    expect(getParentPath('C:\\games\\foo\\bar')).toBe('foo')
  })

  it('strips trailing slashes', () => {
    expect(getParentPath('/a/b/c///')).toBe('b')
  })
})

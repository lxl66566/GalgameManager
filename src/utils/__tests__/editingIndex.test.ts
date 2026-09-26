import { nextEditingIndex } from '@utils/editingIndex'
import { describe, expect, it } from 'vitest'

describe('nextEditingIndex', () => {
  it('stays null when nothing is being edited', () => {
    expect(nextEditingIndex(null, 0)).toBe(null)
    expect(nextEditingIndex(null, 3)).toBe(null)
  })

  it('cancels the edit when the edited row itself is removed', () => {
    expect(nextEditingIndex(2, 2)).toBe(null)
    expect(nextEditingIndex(0, 0)).toBe(null)
  })

  it('shifts down by one when a row before the edited row is removed', () => {
    expect(nextEditingIndex(2, 0)).toBe(1)
    expect(nextEditingIndex(2, 1)).toBe(1)
    expect(nextEditingIndex(1, 0)).toBe(0)
  })

  it('is unchanged when a row after the edited row is removed', () => {
    expect(nextEditingIndex(0, 1)).toBe(0)
    expect(nextEditingIndex(1, 3)).toBe(1)
  })
})

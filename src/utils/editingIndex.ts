/**
 * Compute the editing index after removing the row at `removedIndex`.
 * Removing the edited row itself cancels the edit; removing a row *before*
 * it shifts the edit target down by one so the input stays on the same row.
 *
 * Used by list editors that track an "editing row" by index (PathListEditor).
 */
export function nextEditingIndex(
  current: null | number,
  removedIndex: number
): null | number {
  if (current === null || removedIndex === current) return null
  return removedIndex < current ? current - 1 : current
}

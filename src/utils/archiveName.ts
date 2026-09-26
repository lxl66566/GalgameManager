/**
 * Check whether renaming an archive to `newName` would collide with another
 * existing archive name.
 *
 * The comparison is case-insensitive because archive files may live on
 * case-insensitive filesystems (notably Windows), but the archive's own
 * current name is excluded so that a case-only rename (`a.zip` -> `A.zip`)
 * stays legal.
 */
export function isDuplicateArchiveName(
  existingNames: Iterable<string>,
  oldName: string,
  newName: string
): boolean {
  const target = newName.toLowerCase()
  for (const name of existingNames) {
    if (name !== oldName && name.toLowerCase() === target) return true
  }
  return false
}

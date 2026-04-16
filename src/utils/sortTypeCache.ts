/**
 * Sort type cache utility.
 *
 * Reads/writes the sort type preference to disk via the Tauri fs plugin,
 * while maintaining an in-memory cache to avoid redundant I/O.
 */

import { type SortType } from '@bindings/SortType'
import {
  BaseDirectory,
  readTextFile,
  writeTextFile
} from '@tauri-apps/plugin-fs'

const SORT_TYPE_FILENAME = '.config/GalgameManager/sort_type'
const DEFAULT_SORT_TYPE: SortType = 'id'
const VALID_SORT_TYPES: readonly SortType[] = [
  'id',
  'name',
  'lastPlayed',
  'playTime'
]

/** In-memory cache; `null` means not yet loaded from disk. */
let cached: SortType | null = null

function parse(raw: string): SortType {
  const trimmed = raw.trim() as SortType
  return VALID_SORT_TYPES.includes(trimmed) ? trimmed : DEFAULT_SORT_TYPE
}

/** Load sort type from disk (first call) or return cached value. */
export async function getSortType(): Promise<SortType> {
  if (cached !== null) return cached

  try {
    const raw = await readTextFile(SORT_TYPE_FILENAME, {
      baseDir: BaseDirectory.Home
    })
    cached = parse(raw)
  } catch {
    cached = DEFAULT_SORT_TYPE
  }
  return cached!
}

/**
 * Persist the new sort type.
 *
 * Updates the in-memory cache immediately and writes to disk fire-and-forget
 * so callers never await I/O on a hot path (e.g. button click).
 */
export function setSortType(type: SortType): void {
  cached = type
  writeTextFile(SORT_TYPE_FILENAME, type, {
    baseDir: BaseDirectory.Home
  }).catch(() => {
    // Silently ignore write failures; the in-memory cache is still valid.
  })
}

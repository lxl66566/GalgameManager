/**
 * resolveVar.ts — Frontend-side variable resolution & reverse replacement.
 *
 * Mirrors the Rust `easy_strfmt::strfmt` behaviour (`{key}` → value) so
 * that the UI never needs to call `invoke('resolve_var')` for simple
 * template expansion.
 *
 * Also provides `replaceWithVarNames` which reverses the process: given an
 * absolute path containing a known variable value, it replaces that segment
 * with `{varName}` — ideal for normalising paths that the user pastes or
 * selects via the file dialog.
 */

import type { Device } from '@bindings/Device'
import { currentDeviceId } from '~/store/Singleton'

// ─── resolveVar ──────────────────────────────────────────────────────────────

/**
 * Replace `{key}` placeholders in `template` with the corresponding values
 * from `varMap`.
 *
 * Unlike the Rust side (which errors on missing keys), this implementation is
 * **lenient**: unknown keys are left as-is so the UI doesn't break when the
 * device has no matching variable.
 *
 * Escaped braces (`{{` / `}}`) are handled the same way as Rust's
 * `easy_strfmt` — they produce literal `{` / `}`.
 */
export function resolveVar(template: string, varMap: Record<string, string>): string {
  // Fast path — no braces at all
  if (!template.includes('{')) return template

  const bytes = template
  let result = ''
  let i = 0

  while (i < bytes.length) {
    const openIdx = bytes.indexOf('{', i)
    if (openIdx === -1) {
      result += bytes.slice(i)
      break
    }

    // Push everything before the `{`
    result += bytes.slice(i, openIdx)

    // Escaped `{{` → literal `{`
    if (bytes[openIdx + 1] === '{') {
      result += '{'
      i = openIdx + 2
      continue
    }

    // Find closing `}`
    const closeIdx = bytes.indexOf('}', openIdx + 1)
    if (closeIdx === -1) {
      // Unmatched `{` — treat the rest as literal
      result += bytes.slice(openIdx)
      break
    }

    const key = bytes.slice(openIdx + 1, closeIdx)
    // Look up the key; if not found, leave `{key}` as-is (lenient)
    result += Object.prototype.hasOwnProperty.call(varMap, key) ? varMap[key] : `{${key}}`
    i = closeIdx + 1
  }

  return result
}

// ─── replaceWithVarNames ─────────────────────────────────────────────────────

/**
 * Given an absolute path that may contain one or more variable *values*,
 * replace the **longest** matching value with `{varName}`.
 *
 * Example:
 *   varMap = `{ gameDir: "D:/Games" }`
 *   `"D:/Games/Foo/save"` → `"{gameDir}/Foo/save"`
 *
 * Variables are tried longest-value-first so that the most specific match
 * wins (e.g. `"D:/Games/Gal"` beats `"D:/Games"`).
 */
export function replaceWithVarNames(
  path: string,
  varMap: Record<string, string>
): string {
  if (!path) return path

  const entries = Object.entries(varMap)
    .filter(([, v]) => v.length > 0)
    .sort((a, b) => b[1].length - a[1].length)

  for (const [key, value] of entries) {
    const idx = path.indexOf(value)
    if (idx !== -1) {
      // Only replace the first occurrence
      return path.slice(0, idx) + `{${key}}` + path.slice(idx + value.length)
    }
  }

  return path
}

// ─── Async helpers (require device UID) ──────────────────────────────────────

/**
 * Resolve a template string using the current device's variables.
 *
 * The device UID is fetched once and cached by `currentDeviceId()`.
 */
export async function resolveVarForDevice(
  template: string,
  devices: Device[]
): Promise<string> {
  const uid = await currentDeviceId()
  const varMap = devices.find(d => d.uid === uid)?.variables ?? {}
  return resolveVar(template, varMap)
}

/**
 * Get the variable map for the current device from the devices list.
 *
 * Returns an empty object when the device is not found.
 */
export async function getDeviceVarMap(
  devices: Device[]
): Promise<Record<string, string>> {
  const uid = await currentDeviceId()
  return devices.find(d => d.uid === uid)?.variables ?? {}
}

// ─── Var validation ──────────────────────────────────────────────────────────

/**
 * Extract `{key}` placeholders from a template string and return the keys
 * that are NOT present in the provided varMap.
 *
 * - Escaped braces (`{{` / `}}`) are skipped.
 * - Empty braces `{}` are skipped (commonly used as positional args in
 *   plugin commands like `LEProc.exe "{}"`).
 * - Returns a deduplicated list of unknown variable names.
 */
export function extractUnknownVars(
  template: string,
  varMap: Record<string, string>
): string[] {
  if (!template.includes('{')) return []

  const unknown = new Set<string>()
  let i = 0

  while (i < template.length) {
    const openIdx = template.indexOf('{', i)
    if (openIdx === -1) break

    // Skip escaped {{
    if (template[openIdx + 1] === '{') {
      i = openIdx + 2
      continue
    }

    const closeIdx = template.indexOf('}', openIdx + 1)
    if (closeIdx === -1) break

    const key = template.slice(openIdx + 1, closeIdx)
    // Skip empty braces {} (positional args in commands)
    if (key.length > 0 && !Object.prototype.hasOwnProperty.call(varMap, key)) {
      unknown.add(key)
    }
    i = closeIdx + 1
  }

  return [...unknown]
}

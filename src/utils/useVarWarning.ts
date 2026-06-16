/**
 * useVarWarning — shared hook for the "unknown variable" warning shown below
 * path/command inputs.
 *
 * Scans one or more strings for `{var}` references that don't exist in the
 * current device's variable map, and returns a localized warning string
 * (or `undefined` when there's nothing to warn about / the map hasn't
 * loaded / the check is disabled).
 *
 * Replaces four near-identical inline `createMemo` blocks across
 * `FormInput`, `FormPathInput`, `PathListEditor` and the Local storage form.
 */
import { extractUnknownVars } from '@utils/resolveVar'
import { useVarMap } from '@utils/useVarMap'
import { useI18n } from '~/i18n'
import { createMemo, type Accessor } from 'solid-js'

export function useVarWarning(
  paths: Accessor<string | string[]>,
  enabled: Accessor<boolean> | boolean = true
): Accessor<string | undefined> {
  const { t } = useI18n()
  const varMap = useVarMap()

  return createMemo(() => {
    const isEnabled = typeof enabled === 'function' ? enabled() : enabled
    if (!isEnabled) return undefined
    const vm = varMap()
    if (!vm) return undefined

    const values = paths()
    const list = Array.isArray(values) ? values : [values]
    const allUnknown = new Set<string>()
    for (const p of list) {
      for (const u of extractUnknownVars(p, vm)) allUnknown.add(u)
    }
    return allUnknown.size > 0
      ? t('hint.unknownVar') + [...allUnknown].join(', ')
      : undefined
  })
}

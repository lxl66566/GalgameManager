/**
 * useVarMap — Reactive hook for the current device's variable map.
 *
 * Returns a SolidJS `Resource<Record<string, string>>` that resolves to
 * the current device's variables. Use alongside `extractUnknownVars` from
 * `resolveVar.ts` to validate `{var}` placeholders in input fields.
 */

import { getDeviceVarMap } from '@utils/resolveVar'
import { useConfig } from '~/store'
import { createResource } from 'solid-js'

export function useVarMap() {
  const { config } = useConfig()
  const [varMap] = createResource(() => config.devices, getDeviceVarMap)
  return varMap
}

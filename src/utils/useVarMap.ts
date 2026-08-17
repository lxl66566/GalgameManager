/**
 * useVarMap — Reactive hook for the current device's variable map.
 *
 * Returns a SolidJS `Resource<Record<string, string>>` that resolves to
 * the current device's variables. Use alongside `extractUnknownVars` from
 * `resolveVar.ts` to validate `{var}` placeholders in input fields.
 */

import { getDeviceVarMap } from '@utils/resolveVar'
import { createResource } from 'solid-js'

import { useConfig } from '~/store'

export function useVarMap() {
  const { config } = useConfig()
  const [variableMap] = createResource(() => config.devices, getDeviceVarMap)
  return variableMap
}

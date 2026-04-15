/**
 * SettingSubGroup.tsx — Indented sub-group within a SettingSection.
 */
import type { Component, JSX } from 'solid-js'

export const SettingSubGroup: Component<{ children: JSX.Element }> = props => (
  <div class="bg-gray-50/50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700/50">
    {props.children}
  </div>
)

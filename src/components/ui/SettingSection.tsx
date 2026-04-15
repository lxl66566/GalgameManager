/**
 * SettingSection.tsx — A titled card container for settings page sections.
 */
import { cn } from '~/lib/utils'
import type { Component, JSX } from 'solid-js'

export const SettingSection: Component<{
  title: string
  children: JSX.Element
  class?: string
}> = props => (
  <div class={cn('mb-6', props.class)}>
    <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1 uppercase tracking-wider">
      {props.title}
    </h3>
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {props.children}
    </div>
  </div>
)

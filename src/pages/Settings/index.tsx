// src/pages/settings/Settings.tsx
import { Tabs } from '@components/ui/tabs'
import { createSignal, Match, Switch, type Component } from 'solid-js'

import { useI18n } from '~/i18n'

import { AppearanceTab } from './AppearanceTab'
import { DeviceTab } from './DeviceTab'
import { LaunchTab } from './LaunchTab'
import { StorageTab } from './StorageTab'

type TabKey = 'appearance' | 'device' | 'general' | 'launch'

// Module-level signal: survives SettingsPage mount/unmount cycles caused by
// route changes, so switching away and back keeps the active sub-page.
// (Resets on full reload, which is fine for ephemeral UI state.)
// Note: URL query (`?tab=`) was considered but the sidebar's `<A href="/Settings">`
// strips the query on every navigation, so it can't survive sidebar clicks.
const [activeTab, setActiveTab] = createSignal<TabKey>('general')

export const SettingsPage: Component = () => {
  const { t } = useI18n()

  return (
    <div class="flex h-full flex-col text-gray-900 dark:text-gray-100">
      {/* Header Section (Fixed at top) */}
      <div class="flex flex-shrink-0 flex-col bg-white px-5 pt-3 pb-0 dark:bg-gray-900">
        <h1 class="text-2xl font-bold">{t('settings.self')}</h1>

        {/* Reusable Horizontal Tabs */}
        <Tabs
          items={[
            { key: 'general', label: t('settings.tabs.general') },
            { key: 'launch', label: t('settings.tabs.launch') },
            { key: 'device', label: t('settings.tabs.device') },
            { key: 'appearance', label: t('settings.tabs.appearance') }
          ]}
          onChange={setActiveTab}
          value={activeTab()}
        />
      </div>

      {/* Content Area (Scrollable) */}
      <main class="flex-1 overflow-y-auto p-6 sm:p-8">
        <div class="mx-auto max-w-4xl">
          <Switch>
            <Match when={activeTab() === 'general'}>
              <StorageTab />
            </Match>
            <Match when={activeTab() === 'launch'}>
              <LaunchTab />
            </Match>
            <Match when={activeTab() === 'device'}>
              <DeviceTab />
            </Match>
            <Match when={activeTab() === 'appearance'}>
              <AppearanceTab />
            </Match>
          </Switch>
        </div>
      </main>
    </div>
  )
}

export default SettingsPage

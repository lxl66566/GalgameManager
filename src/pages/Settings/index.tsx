// src/pages/settings/Settings.tsx
import { Tabs, type TabItem } from '@components/ui/tabs'
import { createSignal, Match, Switch, type Component } from 'solid-js'
import { AppearanceTab } from './AppearanceTab'
import { DeviceTab } from './DeviceTab'
import { StorageTab } from './StorageTab'

type TabKey = 'general' | 'storage' | 'device'

export const SettingsPage: Component = () => {
  const [activeTab, setActiveTab] = createSignal<TabKey>('storage')

  const tabs: TabItem<TabKey>[] = [
    { key: 'storage', label: 'Storage & Sync' },
    { key: 'device', label: 'Device & Paths' },
    { key: 'general', label: 'Appearance' }
  ]

  return (
    <div class="flex flex-col h-full text-gray-900 dark:text-gray-100">
      {/* Header Section (Fixed at top) */}
      <div class="bg-white dark:bg-gray-900 px-5 pt-3 pb-0 flex flex-col flex-shrink-0">
        <h1 class="text-2xl font-bold">Settings</h1>

        {/* Reusable Horizontal Tabs */}
        <Tabs items={tabs} value={activeTab()} onChange={setActiveTab} />
      </div>

      {/* Content Area (Scrollable) */}
      <main class="flex-1 overflow-y-auto p-6 sm:p-8">
        <div class="max-w-4xl mx-auto">
          <Switch>
            <Match when={activeTab() === 'storage'}>
              <StorageTab />
            </Match>
            <Match when={activeTab() === 'device'}>
              <DeviceTab />
            </Match>
            <Match when={activeTab() === 'general'}>
              <AppearanceTab />
            </Match>
          </Switch>
        </div>
      </main>
    </div>
  )
}

export default SettingsPage

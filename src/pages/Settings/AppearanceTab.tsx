// src/pages/settings/AppearanceTab.tsx
import { type ThemeMode } from '@bindings/ThemeMode'
import { Select, SettingRow, SettingSection } from '@components/ui/settings'
import { useColorMode } from '@kobalte/core/color-mode'
import { useConfig } from '~/store'
import { type Component } from 'solid-js'

export const AppearanceTab: Component = () => {
  const { config, actions } = useConfig()
  const { setColorMode } = useColorMode()

  return (
    <div class="max-w-4xl">
      <SettingSection title="Interface">
        <SettingRow label="Theme (WIP)" description="Choose how the app looks">
          <Select
            value={config.settings.appearance.theme}
            onChange={e => {
              const newValue = e.currentTarget.value as ThemeMode
              setColorMode(newValue)
              actions.updateSettings(
                s => (s.appearance.theme = e.currentTarget.value as ThemeMode)
              )
            }}
            options={[
              { label: 'System Default', value: 'system' },
              { label: 'Light Mode', value: 'light' },
              { label: 'Dark Mode', value: 'dark' }
            ]}
          />
        </SettingRow>

        <SettingRow label="Language (WIP)" description="Select display language">
          <Select
            value={config.settings.appearance.language}
            onChange={e =>
              actions.updateSettings(s => (s.appearance.language = e.currentTarget.value))
            }
            options={[
              { label: '简体中文', value: 'zh-CN' },
              { label: 'English', value: 'en-US' }
            ]}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

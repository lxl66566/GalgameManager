// src/pages/settings/AppearanceTab.tsx
import { type ThemeMode } from '@bindings/ThemeMode'
import { Select, SettingRow, SettingSection } from '@components/ui/settings'
import { useColorMode } from '@kobalte/core/color-mode'
import { useI18n, type Locale } from '~/i18n'
import { useConfig } from '~/store'
import { IoLanguage } from 'solid-icons/io'
import { type Component } from 'solid-js'

export const AppearanceTab: Component = () => {
  const { config, actions } = useConfig()
  const { setColorMode } = useColorMode()
  const { t, setLocale } = useI18n()

  return (
    <div class="max-w-4xl">
      <SettingSection title="Interface">
        <SettingRow label={t('settings.appearance.theme')}>
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
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' }
            ]}
          />
        </SettingRow>

        <SettingRow label={<IoLanguage class="w-6 h-6" />}>
          <Select
            value={config.settings.appearance.language}
            onChange={e => {
              setLocale(e.currentTarget.value as Locale)
              actions.updateSettings(s => (s.appearance.language = e.currentTarget.value))
            }}
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

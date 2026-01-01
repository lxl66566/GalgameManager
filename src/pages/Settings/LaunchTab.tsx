// src/pages/settings/AppearanceTab.tsx
import { type ThemeMode } from '@bindings/ThemeMode'
import { Select, SettingRow, SettingSection, SwitchToggle } from '@components/ui/settings'
import { useI18n } from '~/i18n'
import { useConfig } from '~/store'
import { IoLanguage } from 'solid-icons/io'
import { type Component } from 'solid-js'

export const LaunchTab: Component = () => {
  const { config, actions } = useConfig()
  const { t } = useI18n()

  return (
    <div class="max-w-4xl">
      <SettingSection title={t('settings.launch.timestat')}>
        <SettingRow
          label={t('settings.launch.precisionMode')}
          description={t('settings.launch.precisionModeDesc')}
        >
          <SwitchToggle
            checked={config.settings.launch.precisionMode}
            onChange={e => actions.updateSettings(s => (s.launch.precisionMode = e))}
          />
        </SettingRow>
      </SettingSection>
    </div>
  )
}

// src/pages/settings/AppearanceTab.tsx
import { myToast } from '@components/ui/myToast'
import { SettingRow, SettingSection, SwitchToggle } from '@components/ui/settings'
import { invoke } from '@tauri-apps/api/core'
import { errToStr } from '@utils/log'
import { type Component } from 'solid-js'

import { useI18n } from '~/i18n'
import { useConfig } from '~/store'

export const LaunchTab: Component = () => {
  const { actions, config } = useConfig()
  const { t } = useI18n()

  // Performs the destructive clear; extracted async so the toast action's
  // `onClick` stays a plain `() => void` (the returned promise is ignored).
  const performClear = async () => {
    try {
      await invoke('clear_all_daily_playtime')
      myToast({
        message: t('settings.launch.dailyStatCleared'),
        variant: 'success'
      })
    } catch (error) {
      myToast({ message: errToStr(error), variant: 'error' })
    }
  }

  const handleClearDailyStat = () => {
    myToast({
      actions: [
        {
          label: t('ui.cancel'),
          onClick: () => {},
          variant: 'secondary'
        },
        {
          label: t('ui.confirm'),
          onClick: () => void performClear(),
          variant: 'danger'
        }
      ],
      message: t('settings.launch.clearDailyStatDesc'),
      title: t('settings.launch.clearDailyStat'),
      variant: 'warning'
    })
  }

  return (
    <div class="max-w-4xl">
      <SettingSection title={t('settings.launch.timestat')}>
        <SettingRow
          description={t('settings.launch.precisionModeDesc')}
          label={t('settings.launch.precisionMode')}
        >
          <SwitchToggle
            checked={config.settings.launch.precisionMode}
            onChange={e => {
              actions.updateSettings({ launch: { precisionMode: e } })
            }}
          />
        </SettingRow>

        <SettingRow
          description={t('settings.launch.dailyStatDesc')}
          label={t('settings.launch.dailyStat')}
        >
          <SwitchToggle
            checked={config.settings.launch.dailyStat}
            onChange={e => {
              actions.updateSettings({ launch: { dailyStat: e } })
            }}
          />
        </SettingRow>

        <SettingRow
          description={t('settings.launch.clearDailyStatDesc')}
          label={t('settings.launch.clearDailyStat')}
        >
          <button
            class="rounded-md border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            onClick={handleClearDailyStat}
          >
            {t('ui.delete')}
          </button>
        </SettingRow>
      </SettingSection>
    </div>
  )
}

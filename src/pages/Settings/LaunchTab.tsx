import { myToast } from '@components/ui/myToast'
import {
  SettingRow,
  SettingSection,
  SettingSubGroup,
  SwitchToggle
} from '@components/ui/settings'
import { invoke } from '@tauri-apps/api/core'
import { errToStr } from '@utils/log'
import { type Component } from 'solid-js'

import { useI18n } from '~/i18n'
import { useConfig } from '~/store'

export const LaunchTab: Component = () => {
  const { actions, config } = useConfig()
  const { t } = useI18n()

  // `dayStart` is seconds past local midnight; the time input gives "HH:MM".
  const dayStartValue = () => {
    const secs = config.settings.launch.dayStart
    const h = String(Math.floor(secs / 3600)).padStart(2, '0')
    const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
    return `${h}:${m}`
  }
  const setDayStart = (value: string) => {
    const [hStr, mStr] = value.split(':')
    const h = Number(hStr)
    const m = Number(mStr)
    // Cleared / malformed input → keep the previous setting.
    if (!Number.isInteger(h) || !Number.isInteger(m)) return
    actions.updateSettings({ launch: { dayStart: h * 3600 + m * 60 } })
  }

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

        {config.settings.launch.dailyStat && (
          <SettingSubGroup>
            <SettingRow
              description={t('settings.launch.dayStartDesc')}
              indent
              label={t('settings.launch.dayStart')}
            >
              <input
                class="rounded-md border border-gray-300 bg-transparent px-2 py-1 text-sm tabular-nums dark:border-gray-600 dark:[color-scheme:dark]"
                onChange={e => {
                  setDayStart(e.currentTarget.value)
                }}
                type="time"
                value={dayStartValue()}
              />
            </SettingRow>
          </SettingSubGroup>
        )}

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

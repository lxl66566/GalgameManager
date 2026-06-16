// src/pages/settings/AppearanceTab.tsx
//
// "Interface" + "Time Display" sub-sections. The time display section
// lets the user pick an independent language for the home-page
// timestamps and switch between relative ("2d ago") and absolute
// ("2026-06-17 12:34") formatting with a custom pattern.
import { type ThemeMode } from '@bindings/ThemeMode'
import { type TimeFormat } from '@bindings/TimeFormat'
import { type TimeLanguage } from '@bindings/TimeLanguage'
import {
  Select,
  SettingRow,
  SettingSection,
  SettingSubGroup
} from '@components/ui/settings'
import { useColorMode } from '@kobalte/core/color-mode'
import { formatAbsoluteIso, formatTimeAgoLocale } from '@utils/time'
import { resolveTimeLanguage, useI18n } from '~/i18n'
import { useConfig } from '~/store'
import { IoLanguage } from 'solid-icons/io'
import { createMemo, type Component } from 'solid-js'

export const AppearanceTab: Component = () => {
  const { config, actions } = useConfig()
  const { setColorMode } = useColorMode()
  const { t, locale } = useI18n()

  return (
    <div class="max-w-4xl">
      <SettingSection title={t('ui.interface')}>
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
              { label: t('settings.appearance.themeSystem'), value: 'system' },
              { label: t('settings.appearance.themeLight'), value: 'light' },
              { label: t('settings.appearance.themeDark'), value: 'dark' }
            ]}
          />
        </SettingRow>

        <SettingRow label={<IoLanguage class="w-6 h-6" />}>
          <Select
            value={config.settings.appearance.language}
            onChange={e => {
              actions.updateSettings(s => (s.appearance.language = e.currentTarget.value))
            }}
            options={[
              { label: 'English', value: 'en-US' },
              { label: '简体中文', value: 'zh-CN' }
            ]}
          />
        </SettingRow>
      </SettingSection>

      <TimeDisplaySection />
    </div>
  )
}

const TimeDisplaySection: Component = () => {
  const { config, actions } = useConfig()
  const { t, locale } = useI18n()

  const cfg = () => config.settings.appearance.timeDisplay
  const timeLocale = createMemo(() => resolveTimeLanguage(cfg().language, locale()))

  // Live preview using a recent fixed date so the user can see how
  // both styles look without having to mouse over a game card.
  const previewIso = () => {
    const d = new Date()
    d.setHours(d.getHours() - 50)
    return d.toISOString()
  }
  const previewRelative = createMemo(() =>
    formatTimeAgoLocale(previewIso(), timeLocale())
  )
  const previewAbsolute = createMemo(() =>
    formatAbsoluteIso(previewIso(), cfg().absoluteFormat)
  )

  return (
    <SettingSection title={t('settings.appearance.timeDisplay.self')}>
      <SettingRow
        label={t('settings.appearance.timeDisplay.language')}
        description={t('settings.appearance.timeDisplay.languageDesc')}
      >
        <Select
          value={cfg().language}
          onChange={e =>
            actions.updateSettings(
              s =>
                (s.appearance.timeDisplay.language = e.currentTarget
                  .value as TimeLanguage)
            )
          }
          options={[
            { label: t('settings.appearance.timeDisplay.languageAuto'), value: 'auto' },
            { label: 'English', value: 'en' },
            { label: '简体中文', value: 'zh' }
          ]}
        />
      </SettingRow>

      <SettingRow label={t('settings.appearance.timeDisplay.format')}>
        <Select
          value={cfg().format}
          onChange={e =>
            actions.updateSettings(
              s => (s.appearance.timeDisplay.format = e.currentTarget.value as TimeFormat)
            )
          }
          options={[
            {
              label: t('settings.appearance.timeDisplay.formatRelative'),
              value: 'relative'
            },
            {
              label: t('settings.appearance.timeDisplay.formatAbsolute'),
              value: 'absolute'
            }
          ]}
        />
      </SettingRow>

      {cfg().format === 'absolute' && (
        <SettingSubGroup>
          <SettingRow
            label={t('settings.appearance.timeDisplay.absoluteFormat')}
            description={t('settings.appearance.timeDisplay.absoluteFormatDesc')}
            indent
          >
            <input
              type="text"
              class="w-48 px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={cfg().absoluteFormat}
              onInput={e =>
                // Avoid disk write per keystroke: use the debounced
                // setter, the value still updates in-memory instantly.
                actions.updateSettingsDebounced(
                  s => (s.appearance.timeDisplay.absoluteFormat = e.currentTarget.value)
                )
              }
              placeholder={t('settings.appearance.timeDisplay.absoluteFormatPlaceholder')}
            />
          </SettingRow>
        </SettingSubGroup>
      )}

      <SettingRow label={t('settings.appearance.timeDisplay.preview')}>
        <span class="text-sm font-mono text-gray-700 dark:text-gray-200">
          {cfg().format === 'absolute' ? previewAbsolute() : previewRelative()}
        </span>
      </SettingRow>
    </SettingSection>
  )
}

// src/pages/settings/AppearanceTab.tsx
//
// "Interface" + "Statistics" + "Time Display" sub-sections. The time display
// section lets the user pick an independent language for the home-page
// timestamps and switch between relative ("2d ago") and absolute
// ("2026-06-17 12:34") formatting with a custom pattern.
import { type ThemeMode } from '@bindings/ThemeMode'
import { type TimeFormat } from '@bindings/TimeFormat'
import { type TimeLanguage } from '@bindings/TimeLanguage'
import {
  Select,
  SettingRow,
  SettingSection,
  SettingSubGroup,
  SwitchToggle
} from '@components/ui/settings'
import { useColorMode } from '@kobalte/core/color-mode'
import { invoke } from '@tauri-apps/api/core'
import { formatAbsoluteIso, formatTimeAgoLocale } from '@utils/time'
import { IoLanguage } from 'solid-icons/io'
import { createMemo, type Component } from 'solid-js'

import { resolveTimeLanguage, useI18n } from '~/i18n'
import { useConfig } from '~/store'

export const AppearanceTab: Component = () => {
  const { actions, config } = useConfig()
  const { setColorMode } = useColorMode()
  const { t } = useI18n()

  return (
    <div class="max-w-4xl">
      <SettingSection title={t('ui.interface')}>
        <SettingRow label={t('settings.appearance.theme')}>
          <Select
            onChange={e => {
              const newValue = e.currentTarget.value as ThemeMode
              setColorMode(newValue)
              actions.updateSettings({ appearance: { theme: newValue } })
            }}
            options={[
              { label: t('settings.appearance.themeSystem'), value: 'system' },
              { label: t('settings.appearance.themeLight'), value: 'light' },
              { label: t('settings.appearance.themeDark'), value: 'dark' }
            ]}
            value={config.settings.appearance.theme}
          />
        </SettingRow>

        <SettingRow label={<IoLanguage class="h-6 w-6" />}>
          <Select
            onChange={e => {
              actions.updateSettings({
                appearance: { language: e.currentTarget.value }
              })
            }}
            options={[
              { label: 'English', value: 'en-US' },
              { label: '简体中文', value: 'zh-CN' }
            ]}
            value={config.settings.appearance.language}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title={t('settings.appearance.statistics.self')}>
        <SettingRow
          description={t('settings.appearance.extractCoverColorDesc')}
          label={t('settings.appearance.extractCoverColor')}
        >
          <SwitchToggle
            checked={config.settings.appearance.extractCoverColor}
            onChange={e => {
              // Just flip the toggle locally — the bulk color work is done
              // on the Rust side so we get symmetric logging + a single
              // `config://updated` emission that reconciles every consumer
              // (statistics charts, GameItem extractColor keying, etc.).
              actions.updateSettings({
                appearance: { extractCoverColor: e }
              })
              void invoke(e ? 'refresh_all_cover_colors' : 'clear_all_cover_colors')
            }}
          />
        </SettingRow>
      </SettingSection>

      <TimeDisplaySection />
    </div>
  )
}

// Sample timestamp (2 days ago) so the format preview shows a concrete
// example (e.g. "2d ago" / "2 天前") instead of an empty string.
const previewIso = () => new Date(Date.now() - 2 * 86_400_000).toISOString()

const TimeDisplaySection: Component = () => {
  const { actions, config } = useConfig()
  const { locale, t } = useI18n()

  const config_ = () => config.settings.appearance.timeDisplay
  const timeLocale = createMemo(() => resolveTimeLanguage(config_().language, locale()))

  const previewRelative = createMemo(() =>
    formatTimeAgoLocale(previewIso(), timeLocale())
  )
  const previewAbsolute = createMemo(() =>
    formatAbsoluteIso(previewIso(), config_().absoluteFormat)
  )

  return (
    <SettingSection title={t('settings.appearance.timeDisplay.self')}>
      <SettingRow label={t('settings.appearance.timeDisplay.format')}>
        <Select
          onChange={e => {
            actions.updateSettings({
              appearance: {
                timeDisplay: { format: e.currentTarget.value as TimeFormat }
              }
            })
          }}
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
          value={config_().format}
        />
      </SettingRow>

      {config_().format === 'relative' && (
        <SettingSubGroup>
          <SettingRow
            description={t('settings.appearance.timeDisplay.languageDesc')}
            indent
            label={t('settings.appearance.timeDisplay.language')}
          >
            <Select
              onChange={e => {
                actions.updateSettings({
                  appearance: {
                    timeDisplay: {
                      language: e.currentTarget.value as TimeLanguage
                    }
                  }
                })
              }}
              options={[
                {
                  label: t('settings.appearance.timeDisplay.languageAuto'),
                  value: 'auto'
                },
                { label: 'English', value: 'en' },
                { label: '简体中文', value: 'zh' }
              ]}
              value={config_().language}
            />
          </SettingRow>
        </SettingSubGroup>
      )}

      {config_().format === 'absolute' && (
        <SettingSubGroup>
          <SettingRow
            description={t('settings.appearance.timeDisplay.absoluteFormatDesc')}
            indent
            label={t('settings.appearance.timeDisplay.absoluteFormat')}
          >
            <input
              class="w-48 rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800 focus:ring-1 focus:ring-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              onInput={e => {
                // Avoid disk write per keystroke: use the debounced
                // setter, the value still updates in-memory instantly.
                actions.updateSettingsDebounced({
                  appearance: {
                    timeDisplay: { absoluteFormat: e.currentTarget.value }
                  }
                })
              }}
              placeholder={t('settings.appearance.timeDisplay.absoluteFormatPlaceholder')}
              type="text"
              value={config_().absoluteFormat}
            />
          </SettingRow>
        </SettingSubGroup>
      )}

      <SettingSubGroup>
        <SettingRow indent label={t('settings.appearance.timeDisplay.preview')}>
          <span class="font-mono text-sm text-gray-700 dark:text-gray-200">
            {config_().format === 'absolute' ? previewAbsolute() : previewRelative()}
          </span>
        </SettingRow>
      </SettingSubGroup>
    </SettingSection>
  )
}

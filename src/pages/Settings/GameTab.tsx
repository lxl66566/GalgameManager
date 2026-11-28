// "Game" tab: settings that apply to every game — save archival and playtime
// tracking.
import type { ArchiveAlgo } from '@bindings/ArchiveAlgo'
import type { ArchiveConfig } from '@bindings/ArchiveConfig'
import { myToast } from '@components/ui/myToast'
import {
  Input,
  Select,
  SettingRow,
  SettingSection,
  SettingSubGroup,
  SwitchToggle
} from '@components/ui/settings'
import { invoke } from '@tauri-apps/api/core'
import { errToStr } from '@utils/log'
import { createMemo, type Component } from 'solid-js'

import { useI18n } from '~/i18n'
import { useConfig } from '~/store'

// Keyed by ArchiveAlgo (a finite union), not `string`: with
// noUncheckedIndexedAccess a Record<string, T> lookup returns T | undefined
// even on the `?? fallback` branch, polluting every downstream use. A finite
// key union makes each access a concrete property lookup (always defined).
const COMPRESSION_RULES: Record<
  ArchiveAlgo,
  { disabled: boolean; max: number; min: number }
> = {
  squashfsZstd: { disabled: false, max: 22, min: 1 }, // Zstd level range: 1-22
  tar: { disabled: true, max: 0, min: 0 } // tar is archive-only, no level
}

const CompressionForm: Component<{
  actions: ReturnType<typeof useConfig>['actions']
  config: ArchiveConfig
}> = props => {
  const { t } = useI18n()

  const currentRule = createMemo(() => COMPRESSION_RULES[props.config.algorithm])

  // Takes the event object so the DOM value can be refilled directly
  const handleLevelChange = (
    e: Event & {
      currentTarget: HTMLInputElement
      target: HTMLInputElement
    }
  ) => {
    const target = e.currentTarget
    const rule = currentRule()
    const rawValue = target.value

    if (rule.disabled) {
      const resetValue = rule.min
      props.actions.updateSettingsDebounced({ archive: { level: resetValue } })
      target.value = resetValue.toString()
      return
    }

    let value = parseInt(rawValue)

    if (Number.isNaN(value)) {
      value = rule.min
    } else {
      if (value < rule.min) value = rule.min
      if (value > rule.max) value = rule.max
    }

    props.actions.updateSettingsDebounced({ archive: { level: value } })

    // Refill the DOM when it disagrees with the computed value, else the UI
    // keeps showing 99 while the store holds 22
    if (target.value !== value.toString()) {
      target.value = value.toString()
    }
  }

  return (
    <SettingSection title={t('settings.compression.self')}>
      <SettingRow label={t('settings.compression.algorithm')}>
        <Select
          onChange={e => {
            props.actions.updateSettings({
              archive: { algorithm: e.currentTarget.value as ArchiveAlgo }
            })
          }}
          options={[
            { label: 'Squashfs + Zstd', value: 'squashfsZstd' },
            { label: 'tar', value: 'tar' }
          ]}
          value={props.config.algorithm}
        />
      </SettingRow>

      <SettingRow label={t('settings.compression.level')}>
        <Input
          disabled={currentRule().disabled}
          max={currentRule().max}
          // min/max feed the browser's native validation UI
          min={currentRule().min}
          onChange={e => {
            handleLevelChange(e)
          }}
          placeholder={
            currentRule().disabled ? 'N/A' : `${currentRule().min}-${currentRule().max}`
          }
          type="number"
          value={currentRule().disabled ? '' : props.config.level}
        />
      </SettingRow>
    </SettingSection>
  )
}

export const GameTab: Component = () => {
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
        message: t('settings.timestat.dailyStatCleared'),
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
      message: t('settings.timestat.clearDailyStatDesc'),
      title: t('settings.timestat.clearDailyStat'),
      variant: 'warning'
    })
  }

  return (
    <div class="max-w-4xl">
      <CompressionForm actions={actions} config={config.settings.archive} />

      <SettingSection title={t('settings.timestat.self')}>
        <SettingRow
          description={t('settings.timestat.precisionModeDesc')}
          label={t('settings.timestat.precisionMode')}
        >
          <SwitchToggle
            checked={config.settings.launch.precisionMode}
            onChange={e => {
              actions.updateSettings({ launch: { precisionMode: e } })
            }}
          />
        </SettingRow>

        <SettingRow
          description={t('settings.timestat.dailyStatDesc')}
          label={t('settings.timestat.dailyStat')}
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
              description={t('settings.timestat.dayStartDesc')}
              indent
              label={t('settings.timestat.dayStart')}
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
          description={t('settings.timestat.clearDailyStatDesc')}
          label={t('settings.timestat.clearDailyStat')}
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

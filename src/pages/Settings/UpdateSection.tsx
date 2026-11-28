// "Update" section of the general tab: opt-in automatic update check, the
// running version and a manual check.
import { Button, SettingRow, SettingSection, SwitchToggle } from '@components/ui/settings'
import { getVersion } from '@tauri-apps/api/app'
import { FiLoader, FiRefreshCw } from 'solid-icons/fi'
import { createResource, createSignal, Show, type Component } from 'solid-js'

import { useI18n } from '~/i18n'
import { useConfig } from '~/store'
import { manualCheckUpdate } from '~/store/updateCheck'

export const UpdateSection: Component = () => {
  const { actions, config } = useConfig()
  const { t } = useI18n()
  const [currentVersion] = createResource(() => getVersion())
  const [checking, setChecking] = createSignal(false)

  const handleCheck = async () => {
    setChecking(true)
    await manualCheckUpdate(t)
    setChecking(false)
  }

  return (
    <SettingSection title={t('settings.update.self')}>
      <SettingRow label={t('settings.update.autoCheck')}>
        <SwitchToggle
          checked={config.settings.autoCheckUpdate}
          onChange={enabled => {
            actions.updateSettings({ autoCheckUpdate: enabled })
          }}
        />
      </SettingRow>

      <SettingRow label={t('settings.update.currentVersion')}>
        <div class="flex items-center gap-3">
          <Show when={currentVersion.latest}>
            <span class="font-mono text-xs text-gray-700 tabular-nums dark:text-gray-200">
              v{currentVersion.latest}
            </span>
          </Show>
          <Button disabled={checking()} onClick={handleCheck}>
            <Show
              fallback={<FiLoader class="h-3.5 w-3.5 animate-spin" />}
              when={!checking()}
            >
              <FiRefreshCw class="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            </Show>
            {checking() ? t('hint.checkingUpdate') : t('settings.update.checkNow')}
          </Button>
        </div>
      </SettingRow>
    </SettingSection>
  )
}

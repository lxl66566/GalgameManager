import type { UpdateStatus } from '@bindings/UpdateStatus'
import { myToast } from '@components/ui/myToast'
import type * as i18n from '@solid-primitives/i18n'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { errToStr, log } from '@utils/log'
import toast from 'solid-toast'

import type { Dictionary } from '~/i18n'

import { useConfig } from '.'

type Translator = i18n.Translator<Dictionary>

// Shared id, so a manual check replaces the startup toast in place.
const TOAST_ID = 'app-update'

const checkUpdate = () => invoke<UpdateStatus>('check_update')

const notifyUpdateAvailable = (
  t: Translator,
  status: Extract<UpdateStatus, { type: 'available' }>
) => {
  myToast({
    actions: [
      {
        label: t('hint.updateGoToRelease'),
        onClick: () => void openUrl(status.url),
        variant: 'primary'
      }
    ],
    message: t('hint.updateAvailable', { version: status.latestVersion }),
    toastId: TOAST_ID,
    variant: 'default'
  })
}

/** Startup check behind the `autoCheckUpdate` setting. Silent unless a newer
 *  release exists. */
export const autoCheckUpdate = async (t: Translator) => {
  if (!useConfig().config.settings.autoCheckUpdate) return
  try {
    const status = await checkUpdate()
    if (status.type === 'available') notifyUpdateAvailable(t, status)
  } catch (error) {
    log.warn(`[UpdateCheck] ${errToStr(error)}`)
  }
}

/** "Check Now" button: reports every outcome. */
export const manualCheckUpdate = async (t: Translator) => {
  toast.loading(t('hint.checkingUpdate'), { id: TOAST_ID })
  try {
    const status = await checkUpdate()
    if (status.type === 'available') {
      notifyUpdateAvailable(t, status)
    } else {
      toast.success(t('hint.updateUpToDate', { version: status.current }), {
        id: TOAST_ID
      })
    }
  } catch (error) {
    toast.error(t('hint.checkUpdateFailed') + ': ' + errToStr(error), {
      id: TOAST_ID
    })
  }
}

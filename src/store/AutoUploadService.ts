import { errToStr, log } from '@utils/log'
import { createEffect, onCleanup, type Accessor } from 'solid-js'

import { useConfig } from '.'

interface AutoUploadOptions {
  enabled: Accessor<boolean>
  execUploadFunc: () => Promise<void>
}

// must be used in sync context
export function useAutoUploadService({ enabled, execUploadFunc }: AutoUploadOptions) {
  const { config } = useConfig()
  // Re-entrancy guard: an upload cycle can take longer than the interval,
  // so skip scheduling a new one while the previous is still in flight.
  let isUploading = false

  createEffect(() => {
    if (!enabled()) {
      log.info('[AutoUploadService] Waiting for remote sync to finish...')
      return
    }

    // Read directly off the store — the effect already tracks it, no need
    // for an inner memo (which would be recreated on every effect run).
    const intervalSecs = config.settings.autoSyncInterval
    if (intervalSecs < 1) {
      log.warn(`[AutoUploadService] interval set to 0, do not start auto upload service.`)
      return
    }

    const intervalMs = intervalSecs * 1000
    log.info(`[AutoUploadService] Service started. Interval: ${intervalSecs}s`)

    // Extracted so the setInterval callback stays a plain `() => void`
    // (its returned promise is intentionally ignored by the timer).
    const tick = async () => {
      if (isUploading) return
      isUploading = true
      try {
        await execUploadFunc()
      } catch (error) {
        log.error(`[AutoUploadService] Check failed: ${errToStr(error)}`)
      } finally {
        isUploading = false
      }
    }

    const timerId = setInterval(() => void tick(), intervalMs)

    onCleanup(() => {
      log.info('[AutoUploadService] Timer cleared')
      clearInterval(timerId)
    })
  })
}

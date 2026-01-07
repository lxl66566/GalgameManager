import { log } from '@utils/log'
import { createEffect, createMemo, onCleanup, type Accessor } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { useConfig } from '.'

// 假设的 Config 类型定义补充，确保类型安全
interface AutoUploadOptions {
  enabled: Accessor<boolean>
  execUploadFunc: () => Promise<void>
}

// must be used in sync context
export function useAutoUploadService({ enabled, execUploadFunc }: AutoUploadOptions) {
  const { config } = useConfig()
  let isUploading = false

  createEffect(() => {
    if (!enabled()) {
      log.info('[AutoUploadService] Waiting for remote sync to finish...')
      return
    }

    const intervalSecs = createMemo(() => config.settings.autoSyncInterval)
    if (intervalSecs() < 1) {
      log.warn(`[AutoUploadService] interval set to 0, do not start auto upload service.`)
      return
    }

    const intervalMs = intervalSecs() * 1000
    log.info(`[AutoUploadService] Service started. Interval: ${intervalSecs()}s`)

    // 3. 启动定时器
    const timerId = setInterval(async () => {
      // 防重入锁
      if (isUploading) return

      try {
        // 4. 获取最新状态（关键点）
        // 在回调函数内部读取 config，不会被 createEffect 追踪为依赖。
        // 使用 unwrap 获取纯数据对象，避免在异步操作中产生意外的代理开销
        const current = unwrap(config)

        // 检查必要字段是否存在
        if (!current.lastUpdated) return

        const lastUpdated = new Date(current.lastUpdated)
        const lastUploaded = current.lastUploaded
          ? new Date(current.lastUploaded)
          : new Date(0)

        // 5. 比较逻辑：本地更新时间 > 上次上传时间
        if (lastUpdated > lastUploaded) {
          isUploading = true
          log.info(
            '[AutoUploadService] Changes detected (lastUpdated > lastUploaded), trying to upload...'
          )

          // 执行上传
          await execUploadFunc()
        } else {
          log.info('[AutoUploadService] No changes detected, skipping upload...')
        }
      } catch (error) {
        log.error(`[AutoUploadService] Check failed: ${error}`)
      } finally {
        isUploading = false
      }
    }, intervalMs)

    // 6. 清理函数
    // 当 intervalMinutes 变化导致 effect 重新运行，或组件卸载时调用
    onCleanup(() => {
      log.info('[AutoUploadService] Timer cleared')
      clearInterval(timerId)
    })
  })
}

import { createEffect, onCleanup } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { useConfig } from '.'

// 假设的 Config 类型定义补充，确保类型安全
interface AutoUploadOptions {
  performUpload: () => Promise<void>
}

export function useAutoUploadService({ performUpload }: AutoUploadOptions) {
  const { config } = useConfig()

  // 使用 Ref 或简单的变量来防止在上传过程中重复触发（防重入）
  let isUploading = false

  createEffect(() => {
    let intervalSecs = config.settings.autoSyncInterval
    if (intervalSecs < 1) intervalSecs = 1

    const intervalMs = intervalSecs * 1000
    console.log(`[AutoUpload] Service started. Interval: ${intervalSecs}s`)

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
          console.log('[AutoUpload] Changes detected, starting upload...')

          // 执行上传
          await performUpload()
        }
      } catch (error) {
        console.error('[AutoUpload] Check failed:', error)
      } finally {
        isUploading = false
      }
    }, intervalMs)

    // 6. 清理函数
    // 当 intervalMinutes 变化导致 effect 重新运行，或组件卸载时调用
    onCleanup(() => {
      console.log('[AutoUpload] Timer cleared')
      clearInterval(timerId)
    })
  })
}

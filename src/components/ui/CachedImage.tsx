import { invoke } from '@tauri-apps/api/core'
import { loadCachedImage } from '@utils/image'
import { createEffect, createResource, onCleanup, Show, type Component } from 'solid-js'
import toast from 'solid-toast'

interface ImageProps {
  url?: string | null | undefined
  hash?: string | null | undefined
  alt?: string
  class?: string
  onHashUpdate?: (newHash: string) => void
}

const CachedImage: Component<ImageProps> = props => {
  // Resource 只监听 url 变化，不再监听 hash
  // 这样当 Hash 计算完成并更新回 props 时，不会触发二次重载
  const [imageData] = createResource(
    () => props.url,
    async rawUrl => {
      if (!rawUrl) return null

      try {
        // 1. 第一步：解析变量
        // 如果 rawUrl 里没有变量，resolve_var 应该原样返回
        const resolvedUrl = await invoke<string>('resolve_var', { s: rawUrl })

        // 2. 第二步：加载图片
        // 注意：这里传入的是解析后的绝对路径/URL
        return await loadCachedImage(resolvedUrl, props.hash)
      } catch (e: any) {
        toast.error(`failed to load image: ${e}`)

        // 必须抛出错误，以便 Resource 进入 error 状态，UI 显示错误占位符
        throw e
      }
    }
  )

  // 2. 监听 Hash 变化并通知父组件 (保持不变)
  createEffect(() => {
    // 安全访问：先检查状态，避免在错误或加载时读取导致异常
    if (imageData.state === 'ready' && imageData()) {
      const data = imageData()
      if (data && data.hash && props.hash !== data.hash) {
        props.onHashUpdate?.(data.hash)
      }
    }
  })

  // 3. 错误提示 (保持不变)
  createEffect(() => {
    if (imageData.error) {
      // 仅在控制台打印详细错误，UI 上显示简略信息
      console.warn(`[Image Load Failed] ${props.url}:`, imageData.error)
    }
  })

  // 4. 清理内存 (保持不变)
  createEffect(() => {
    if (imageData.state === 'ready' && imageData()?.src) {
      const src = imageData()!.src
      onCleanup(() => URL.revokeObjectURL(src))
    }
  })

  return (
    <div class={`relative overflow-hidden bg-gray-800/50 ${props.class || ''}`}>
      <Show when={imageData.loading}>
        <div class="absolute inset-0 flex items-center justify-center bg-gray-100/10 backdrop-blur-sm z-10">
          <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      </Show>

      {/* 错误状态：显式处理，防止 Suspense 无法恢复 */}
      <Show when={imageData.error}>
        <div
          class="absolute inset-0 flex flex-col items-center justify-center bg-red-900/20 border border-red-500/30 text-red-400 p-2"
          title={String(imageData.error)}
        >
          <span class="text-[10px] font-mono opacity-80">Load Failed</span>
        </div>
      </Show>

      <Show when={!imageData.error && !imageData.loading && imageData()}>
        {data => (
          <img
            src={data().src}
            alt={props.alt || 'Game cover'}
            class="w-full h-full object-cover animate-in fade-in duration-300"
            onError={e => {
              e.currentTarget.style.display = 'none'
              toast.error('Image render failed')
            }}
          />
        )}
      </Show>
    </div>
  )
}

export default CachedImage

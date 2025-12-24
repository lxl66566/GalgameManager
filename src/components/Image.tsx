import { createEffect, createResource, Show, type Component } from 'solid-js'
import { loadCachedImage } from '../utils/image'

interface ImageProps {
  url: string
  hash?: string // 可选的已知 Hash
  alt?: string
  class?: string
  /** 当计算出新的 Hash 或 Hash 不一致时回调，用于保存配置 */
  onHashUpdate?: (newHash: string) => void
}

const Image: Component<ImageProps> = props => {
  // 使用 createResource 处理异步加载逻辑
  const [imageData] = createResource(
    () => ({ url: props.url, hash: props.hash }),
    async ({ url, hash }) => {
      if (!url) return null
      return await loadCachedImage(url, hash)
    }
  )

  // 监听 Hash 变化并通知父组件保存
  createEffect(() => {
    const data = imageData()
    if (data && data.hash) {
      // 如果传入的 hash 不存在，或者计算出的 hash 与传入的不一致，则更新
      if (props.hash !== data.hash) {
        props.onHashUpdate?.(data.hash)
      }
    }
  })

  return (
    <div class={`relative overflow-hidden ${props.class || ''}`}>
      {/* 加载状态 */}
      <Show when={imageData.loading}>
        <div class="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400">
          <span class="text-xs">Loading...</span>
        </div>
      </Show>

      {/* 错误状态 */}
      <Show when={imageData.error != null}>
        <div
          class="absolute inset-0 flex items-center justify-center bg-red-50 text-red-400"
          title={imageData.error}
        >
          <span class="text-xs">Error</span>
        </div>
      </Show>

      {/* 图片显示 */}
      <Show when={imageData()}>
        {data => (
          <img
            src={data().src}
            alt={props.alt || 'image'}
            class={`w-full h-full object-cover transition-opacity duration-300 ${
              imageData.loading ? 'opacity-0' : 'opacity-100'
            }`}
          />
        )}
      </Show>
    </div>
  )
}

export default Image

import { type ImageData } from '@bindings/ImageData'
import { invoke } from '@tauri-apps/api/core'
import { getBase64ImageSrc } from '@utils/image'
import { createEffect, createResource, Show, type Component } from 'solid-js'
import toast from 'solid-toast'

// 缓存最大容量，防止 Base64 占用过多内存
const MAX_CACHE_SIZE = 50
const imageCache = new Map<string, ImageData>()

/**
 * 将图片存入缓存 (LRU 策略)
 */
const cacheImage = (data: ImageData) => {
  if (!data.hash) return

  // 如果已存在，先删除再重新添加，使其变为"最近使用"
  if (imageCache.has(data.hash)) {
    imageCache.delete(data.hash)
  } else if (imageCache.size >= MAX_CACHE_SIZE) {
    // 缓存已满，删除最早插入的元素 (Map 的迭代器顺序即插入顺序)
    const firstKey = imageCache.keys().next().value
    if (firstKey) imageCache.delete(firstKey)
  }

  imageCache.set(data.hash, data)
}

/**
 * 尝试从缓存获取
 */
const getCachedImage = (hash?: string | null): ImageData | undefined => {
  if (!hash) return undefined
  const data = imageCache.get(hash)
  if (data) {
    // 命中缓存，刷新其在 LRU 中的位置
    imageCache.delete(hash)
    imageCache.set(hash, data)
  }
  return data
}

// --- Component ---

interface ImageProps {
  url?: string | null | undefined
  hash?: string | null | undefined
  alt?: string
  class?: string
  onHashUpdate?: (newHash: string) => void
}

const CachedImage: Component<ImageProps> = props => {
  // 使用数组作为 source，同时监听 url 和 hash 的变化
  const [imageData] = createResource(
    () => [props.url, props.hash] as const,
    async ([rawUrl, currentHash]) => {
      // 1. 优先检查缓存 (根据 Hash)
      // 如果有 Hash 且缓存命中，直接返回，无需任何 IPC 通信
      const cached = getCachedImage(currentHash)
      if (cached) {
        return cached
      }

      if (!rawUrl) return null

      try {
        // 2. 缓存未命中，执行 Rust 通信
        // 第一步：解析变量
        const resolvedUrl = await invoke<string>('resolve_var', { s: rawUrl })

        // 第二步：加载图片
        const data = await invoke<ImageData>('get_image', {
          url: resolvedUrl,
          hash: currentHash
        })

        // 3. 存入缓存
        cacheImage(data)

        return data
      } catch (e: any) {
        // 仅在非取消错误时 toast，避免快速切换路由时的干扰
        if (!String(e).includes('cancelled')) {
          toast.error(`failed to load image: ${e}`)
        }
        throw e
      }
    }
  )

  // 监听 Hash 变化并通知父组件 (用于首次加载生成 Hash 后回写 Config)
  createEffect(() => {
    if (imageData.state === 'ready') {
      const data = imageData()
      // 只有当新获取的 hash 与 props 传入的不一致时才通知，避免死循环
      if (data && data.hash && props.hash !== data.hash) {
        props.onHashUpdate?.(data.hash)
      }
    }
  })

  // 错误日志
  createEffect(() => {
    if (imageData.error) {
      console.warn(`[Image Load Failed] ${props.url}:`, imageData.error)
    }
  })

  return (
    <div class={`relative overflow-hidden bg-gray-800/50 ${props.class || ''}`}>
      {/* Loading 状态：仅在没有数据且正在加载时显示 */}
      <Show when={imageData.loading && !imageData.latest}>
        <div class="absolute inset-0 flex items-center justify-center bg-gray-100/10 backdrop-blur-sm z-10">
          <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      </Show>

      {/* 错误状态 */}
      <Show when={imageData.error}>
        <div
          class="absolute inset-0 flex flex-col items-center justify-center bg-red-900/20 border border-red-500/30 text-red-400 p-2"
          title={String(imageData.error)}
        >
          <span class="text-[10px] font-mono opacity-80">Load Failed</span>
        </div>
      </Show>

      {/* 图片显示 */}
      <Show when={imageData()}>
        {data => (
          <img
            src={getBase64ImageSrc(data().base64)}
            alt={props.alt || 'Game cover'}
            class="w-full h-full object-cover animate-in fade-in duration-300"
            onError={e => {
              e.currentTarget.style.display = 'none'
              // 避免重复 toast，这里可以仅 log
              console.error('Image render failed (DOM error)')
            }}
          />
        )}
      </Show>
    </div>
  )
}

export default CachedImage

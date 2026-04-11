import { invoke } from '@tauri-apps/api/core'
import { log } from '@utils/log'
import {
  createEffect,
  createResource,
  ErrorBoundary,
  Suspense,
  type Component
} from 'solid-js'

interface ImageProps {
  url?: string | null | undefined
  hash?: string | null | undefined
  alt?: string
  class?: string
  onHashUpdate?: (newHash: string) => void
}

/**
 * Image component backed by the `galimg` custom protocol.
 *
 * - If a `hash` is already known, the image is served directly via the custom
 *   protocol with **zero IPC** — the browser handles HTTP-level caching.
 * - If no hash exists, `prepare_image` is called once to download/cache the
 *   image on disk; subsequent renders use the cached hash.
 * - No in-memory cache is kept; images are always served from the filesystem
 *   through the custom protocol, keeping JS heap usage minimal.
 */
const CachedImage: Component<ImageProps> = props => {
  const [imageHash] = createResource(
    () => [props.url, props.hash] as const,
    async ([rawUrl, currentHash]) => {
      // Fast path: hash already known — serve directly via custom protocol.
      // No IPC call needed; the browser will request the image from Rust.
      if (currentHash) return currentHash

      if (!rawUrl) return null

      try {
        const resolvedUrl = await invoke<string>('resolve_var', { s: rawUrl })
        const hash = await invoke<string>('prepare_image', {
          url: resolvedUrl,
          hash: currentHash
        })

        // 只有当 hash 存在，且与当前的 hash 不一致时，才触发更新事件
        if (hash !== currentHash) {
          props.onHashUpdate?.(hash)
        }

        return hash
      } catch (e: any) {
        throw e
      }
    }
  )

  // Error logging
  createEffect(() => {
    if (imageHash.error) {
      log.warn(`[Image Load Failed] ${props.url}: ${imageHash.error}`)
    }
  })

  return (
    <div class={`relative overflow-hidden bg-gray-800/50 ${props.class || ''}`}>
      <ErrorBoundary
        fallback={(err, reset) => (
          <div
            class="absolute inset-0 flex flex-col items-center justify-center bg-red-900/20 border border-red-500/30 text-red-400 p-2"
            title={err.toString()}
          >
            <span class="text-[10px] font-mono opacity-80">
              Load Failed: {err.toString()}
            </span>
          </div>
        )}
      >
        <Suspense
          fallback={
            <div class="absolute inset-0 flex items-center justify-center bg-gray-100/10 backdrop-blur-sm z-10">
              <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          }
        >
          {imageHash() ? (
            <img
              src={`http://galimg.localhost/${imageHash()!}`}
              alt={props.alt}
              class="w-full h-full object-cover animate-in fade-in duration-300"
            />
          ) : (
            <div class="w-full h-full bg-transparent" />
          )}
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}

export default CachedImage

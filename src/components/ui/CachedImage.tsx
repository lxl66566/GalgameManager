import { invoke } from '@tauri-apps/api/core'
import { log } from '@utils/log'
import { resolveVarForDevice } from '@utils/resolveVar'
import { cn } from '~/lib/utils'
import { useConfig } from '~/store'
import {
  createEffect,
  createResource,
  ErrorBoundary,
  Suspense,
  type Component
} from 'solid-js'
import { Spinner } from './Spinner'

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
 * - Always calls `prepare_image` via IPC to ensure the image cache exists on
 *   this device. Rust handles the fast-path (cache hit) efficiently.
 * - This guarantees images display correctly even when a hash was synced from
 *   another device but the local cache is missing.
 * - No in-memory cache is kept; images are always served from the filesystem
 *   through the custom protocol, keeping JS heap usage minimal.
 */
const CachedImage: Component<ImageProps> = props => {
  const { config } = useConfig()

  const [imageHash] = createResource(
    () => [props.url, props.hash] as const,
    async ([rawUrl, currentHash]) => {
      if (!rawUrl) return null

      try {
        const resolvedUrl = await resolveVarForDevice(rawUrl, config.devices)
        // Always call prepare_image to ensure cache exists on this device.
        // Rust handles fast-path (cache hit) efficiently — just a file exists check.
        const hash = await invoke<string>('prepare_image', {
          url: resolvedUrl,
          hash: currentHash
        })

        // Notify parent of the resolved hash (may differ from currentHash
        // if cache was missing and had to be re-computed)
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
    <div class={cn('relative overflow-hidden bg-gray-800/50', props.class || '')}>
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
              <Spinner size="sm" class="text-white/60" />
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

import { invoke } from '@tauri-apps/api/core'
import { log } from '@utils/log'
import { isWindows } from '@utils/platform'
import { resolveVarForDevice } from '@utils/resolveVar'
import { useConfig } from '~/store'
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
  /** When true, ask the backend to also derive an accent color from this
   *  image. Callers set this to "color not yet cached" (e.g.
   *  `!game.coverColor`) so each image is decoded at most once. */
  extractColor?: boolean
  /** Fires with a freshly extracted "#RRGGBB" color. Only called when
   *  `extractColor` is true and the backend actually computed one. */
  onColorExtracted?: (color: string) => void
}

/**
 * Image component backed by the `galimg` custom protocol.
 *
 * - Always calls `prepare_image` via IPC to ensure the image cache exists on
 *   this device. Rust handles the fast-path (cache hit) efficiently.
 * - This guarantees images display correctly even when a hash was synced from
 *   another device but the local cache is missing.
 * - When `extractColor` is set, the same `prepare_image` call additionally
 *   derives a dominant accent color — no second IPC round-trip is needed.
 * - No in-memory cache is kept; images are always served from the filesystem
 *   through the custom protocol, keeping JS heap usage minimal.
 */
// Tauri v2 custom protocol URL differs by platform:
//   Windows/Android → http://{scheme}.localhost/{path}
//   Linux/macOS/iOS → {scheme}://localhost/{path}
export function galimgUrl(hash: string): string {
  return isWindows ? `http://galimg.localhost/${hash}` : `galimg://localhost/${hash}`
}

const CachedImage: Component<ImageProps> = props => {
  const { config } = useConfig()

  // Use a stable string key so the fetcher only re-runs when a value
  // actually changes. Returning a fresh array would always trip Solid's
  // `===` source comparison and re-trigger the IPC call.
  //
  // `extractColor` is gated by `appearance.extractCoverColor` so that the
  // global toggle fully disables the pipeline — no color work happens in
  // `prepare_image`, and (combined with the toggle's clearing logic) no
  // stale `coverColor` lingers on any game.
  const colorEnabled = () =>
    (props.extractColor ?? false) && config.settings.appearance.extractCoverColor
  const [imageHash] = createResource(
    () => `${props.url ?? ''}\0${props.hash ?? ''}\0${colorEnabled()}`,
    // eslint-disable-next-line solid/reactivity -- fetcher only re-runs on key change; reactive props are safe
    async key => {
      const [rawUrl, currentHash, extractColor] = key.split('\0') as [
        string,
        string,
        'true' | 'false'
      ]
      if (!rawUrl) return null

      const resolvedUrl = await resolveVarForDevice(rawUrl, config.devices)
      // Always call prepare_image to ensure cache exists on this device.
      // Rust handles fast-path (cache hit) efficiently — just a file exists
      // check. When `extractColor` is set, the same call derives a color.
      //
      // Pass `null` (not `''`) when there's no known hash: Tauri serializes
      // `''` as `Some("")` on the Rust side, which previously made
      // `PathBuf::join("")` resolve to the cache directory itself and return
      // a bogus empty hash. The backend now validates, but the right
      // semantic on the TS side is still `null`.
      const [hash, color] = await invoke<[string, string | null]>('prepare_image', {
        url: resolvedUrl,
        sha256: currentHash || null,
        needColor: extractColor === 'true'
      })

      // Notify parent of the resolved hash (may differ from currentHash
      // if cache was missing and had to be re-computed). Fire before the
      // color callback so a parent that clears the stale color on hash
      // change applies the clear before the fresh color lands.
      if (hash !== currentHash) {
        props.onHashUpdate?.(hash)
      }
      if (color) {
        props.onColorExtracted?.(color)
      }

      return hash
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
        fallback={err => (
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
              src={galimgUrl(imageHash()!)}
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

import { appCacheDir, join } from '@tauri-apps/api/path'
import { BaseDirectory, exists, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs'
import { fetch } from '@tauri-apps/plugin-http'

const CACHE_SUBDIR = 'img_cache'

function getMimeType(pathOrUrl: string): string {
  const ext = pathOrUrl.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
    bmp: 'image/bmp'
  }
  return map[ext || ''] || 'application/octet-stream'
}

async function calculateFileHash(buffer: ArrayBuffer): Promise<string> {
  const fullHashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const truncatedBuffer = fullHashBuffer.slice(0, 16)
  return arrayBufferToBase64Url(truncatedBuffer)
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 尝试创建缓存目录，失败不抛出异常，返回 null 表示缓存不可用
 */
async function ensureCacheDir(): Promise<string | null> {
  try {
    const base = await appCacheDir()
    const dir = await join(base, CACHE_SUBDIR)
    if (!(await exists(CACHE_SUBDIR, { baseDir: BaseDirectory.AppCache }))) {
      await mkdir(CACHE_SUBDIR, {
        baseDir: BaseDirectory.AppCache,
        recursive: true
      })
    }
    return dir
  } catch (error) {
    console.warn('Cache directory access failed, running in memory-only mode:', error)
    return null
  }
}

export async function loadCachedImage(
  url: string,
  expectedHash?: string | null
): Promise<{ src: string; hash: string }> {
  // === 场景 1: 本地文件路径 ===
  if (!url.startsWith('http')) {
    try {
      const data = await readFile(url)
      const blob = new Blob([data], { type: getMimeType(url) })
      return { src: URL.createObjectURL(blob), hash: '' }
    } catch (e) {
      throw new Error(`Local file not found: ${e}`)
    }
  }

  // === 场景 2: 网络图片 ===
  const cacheDir = await ensureCacheDir()

  // 2.1 检查缓存
  if (cacheDir && expectedHash) {
    try {
      const cachePath = await join(CACHE_SUBDIR, expectedHash)
      if (await exists(cachePath, { baseDir: BaseDirectory.AppCache })) {
        const data = await readFile(cachePath, { baseDir: BaseDirectory.AppCache })
        const blob = new Blob([data], { type: getMimeType(url) })
        return { src: URL.createObjectURL(blob), hash: expectedHash }
      }
      // oxlint-disable-next-line no-unused-vars
    } catch (e) {
      console.warn('Cache read failed, fallback to network...')
    }
  }

  // 2.2 下载图片 (增加超时控制)
  try {
    // 设置 15秒 超时，避免永久卡住
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const hash = await calculateFileHash(arrayBuffer)

    // 2.3 写入缓存 (不阻塞)
    if (cacheDir) {
      const uint8Array = new Uint8Array(arrayBuffer)
      const fileName = await join(CACHE_SUBDIR, hash)
      writeFile(fileName, uint8Array, { baseDir: BaseDirectory.AppCache }).catch(err =>
        console.warn('Cache write failed:', err)
      )
    }

    const blob = new Blob([arrayBuffer], {
      type: response.headers.get('content-type') || getMimeType(url)
    })
    return { src: URL.createObjectURL(blob), hash }
  } catch (e: any) {
    // 区分超时错误和其他错误
    const msg = e.name === 'AbortError' ? 'Timeout' : e.message
    throw new Error(msg)
  }
}

import { convertFileSrc } from '@tauri-apps/api/core'
import { appCacheDir, join } from '@tauri-apps/api/path'
import { BaseDirectory, exists, mkdir, writeFile } from '@tauri-apps/plugin-fs'
import { fetch } from '@tauri-apps/plugin-http'

const CACHE_SUBDIR = 'img_cache'

/**
 * 计算数据的 Hash 并转换为文件名友好的短字符串
 * 策略: SHA-256 -> 截取前16字节 (128-bit) -> Base64url 编码
 * 结果长度: 22 个字符
 */
async function calculateFileHash(buffer: ArrayBuffer): Promise<string> {
  // 1. 计算 SHA-256 (32 bytes)
  const fullHashBuffer = await crypto.subtle.digest('SHA-256', buffer)

  // 2. 截取前 16 字节 (128 bits)
  // 128位对于文件去重已经足够安全 (碰撞概率极低)
  const truncatedBuffer = fullHashBuffer.slice(0, 16)

  // 3. 转换为 Base64url
  // 浏览器环境通常使用 btoa，Node.js 可以用 Buffer，这里用通用的转换方法
  return arrayBufferToBase64Url(truncatedBuffer)
}

/**
 * 辅助函数：将 ArrayBuffer 转换为 Base64url 字符串
 * Base64url: 替换 '+' -> '-', '/' -> '_', 去掉 '='
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }

  // 使用 btoa 转标准 Base64
  const base64 = btoa(binary)

  // 替换非 URL 安全字符，并移除填充
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 确保缓存目录存在
 * 修复：显式处理 mkdir，避免 unsafe assignment 警告
 */
async function ensureCacheDir(): Promise<string> {
  const base = await appCacheDir()
  const dir = await join(base, CACHE_SUBDIR)

  try {
    await mkdir(CACHE_SUBDIR, {
      baseDir: BaseDirectory.AppCache,
      recursive: true
    })
  } catch (error) {
    console.error('Failed to create cache directory:', error)
  }

  return dir
}

/**
 * 核心逻辑：处理图片加载
 */
export async function loadCachedImage(
  url: string,
  expectedHash?: string | null
): Promise<{ src: string; hash: string }> {
  // 1. 如果是本地路径，直接转换
  if (!url.startsWith('http')) {
    return { src: convertFileSrc(url), hash: '' }
  }

  const cacheDir = await ensureCacheDir()

  // 2. 如果提供了 Hash，先检查本地缓存是否存在
  if (expectedHash) {
    // 注意：exists 需要相对路径配合 baseDir
    const cachePath = await join(CACHE_SUBDIR, expectedHash)
    const isCached = await exists(cachePath, { baseDir: BaseDirectory.AppCache })

    if (isCached) {
      const fullPath = await join(cacheDir, expectedHash)
      return { src: convertFileSrc(fullPath), hash: expectedHash }
    }
  }

  // 3. 下载图片
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`)

  // 修复：获取原始 ArrayBuffer，用于 digest 计算
  const arrayBuffer = await response.arrayBuffer()

  // 4. 计算 Hash (直接传入 ArrayBuffer)
  const hash = await calculateFileHash(arrayBuffer)

  // 5. 写入文件 (转换为 Uint8Array 用于 fs 写入)
  const uint8Array = new Uint8Array(arrayBuffer)
  const fileName = await join(CACHE_SUBDIR, hash)

  await writeFile(fileName, uint8Array, { baseDir: BaseDirectory.AppCache })

  // 6. 获取绝对路径用于显示
  const finalPath = await join(cacheDir, hash)

  return { src: convertFileSrc(finalPath), hash }
}

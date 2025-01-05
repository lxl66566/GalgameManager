import steamSearch from './steamSearch'

async function downloadImageToBlob(
  imageUrl: string
): Promise<{ blob: Blob; type: string }> {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`)
  }
  const blob = await response.blob()
  return { blob, type: blob.type } // 返回 Blob 和它的 MIME 类型
}

export { downloadImageToBlob, steamSearch }

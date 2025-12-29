/**
 * 根据 Base64 字符串识别图片类型并返回可用的 src
 * @param {string} base64Str - 纯 Base64 字符串 (不带 data:前缀)
 * @returns {string} 完整的 Data URI
 */
export const getBase64ImageSrc = (base64Str: string) => {
  // 1. 去除可能存在的空格或换行
  const str = base64Str.trim()

  // 2. 定义常见图片格式的 Base64 签名映射
  // 注意：这里只判断前几个字符即可区分
  let mimeType = 'image/png' // 默认回退类型

  if (str.startsWith('/9j/')) {
    mimeType = 'image/jpeg'
  } else if (str.startsWith('iVBORw0KGgo')) {
    mimeType = 'image/png'
  } else if (str.startsWith('R0lGOD')) {
    mimeType = 'image/gif'
  } else if (str.startsWith('UklGR')) {
    mimeType = 'image/webp'
  } else if (str.startsWith('PHN2Zy') || str.startsWith('PD94bW')) {
    // PHN2Zy -> <svg | PD94bW -> <?xml (SVG 常用开头)
    mimeType = 'image/svg+xml'
  } else if (str.startsWith('Qk0')) {
    mimeType = 'image/bmp'
  }

  // 3. 拼接完整的 Data URI
  return `data:${mimeType};base64,${str}`
}

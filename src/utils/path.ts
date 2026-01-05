export function getParentPath(pathStr: string): string | undefined {
  // 处理空字符串或只有分隔符的情况
  if (!pathStr || /^[\\/]*$/.test(pathStr)) {
    return undefined
  }

  // 标准化路径：将 Windows 反斜杠转换为正斜杠，移除末尾分隔符
  const normalized = pathStr.replace(/\\/g, '/').replace(/\/+$/, '')

  if (!normalized) {
    return undefined
  }

  // 处理 Windows 根路径（如 C:/）
  if (/^[A-Za-z]:\/$/.test(normalized)) {
    return undefined
  }

  // 处理 Unix 根路径
  if (normalized === '/') {
    return undefined
  }

  // 处理 Windows 网络路径（如 //server/share）
  if (/^\/\/[^/]+\/[^/]+\/?$/.test(normalized)) {
    return undefined
  }

  // 获取最后一个斜杠的位置
  const lastSlashIndex = normalized.lastIndexOf('/')

  if (lastSlashIndex === -1) {
    // 没有斜杠，说明是当前目录的文件名
    return undefined
  }

  // 提取父路径部分
  const parentPath = normalized.substring(0, lastSlashIndex)

  // 如果父路径为空，返回 undefined（如 "file.txt" -> ""）
  if (!parentPath) {
    return undefined
  }

  // 从父路径中提取最后一个目录名
  const lastSlashBeforeParent = parentPath.lastIndexOf('/')

  if (lastSlashBeforeParent === -1) {
    // 父路径中没有斜杠，直接返回父路径
    return parentPath
  }

  // 返回最后一个斜杠之后的部分
  return parentPath.substring(lastSlashBeforeParent + 1)
}

export function fuckBackslash(path: string): string {
  return path.replace(/\\/g, '/')
}

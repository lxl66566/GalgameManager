export function fuckBackslash(path: string): string {
  return path.replaceAll('\\', '/')
}

export function getParentPath(pathString: string): string | undefined {
  if (!pathString || /^[\\/]*$/.test(pathString)) {
    return undefined
  }

  // Normalize: backslashes -> slashes, strip trailing separators
  const normalized = pathString.replaceAll('\\', '/').replace(/\/+$/, '')

  if (!normalized) {
    return undefined
  }

  // Windows root (C:/), Unix root, UNC share root (//server/share)
  if (/^[A-Z]:\/$/i.test(normalized)) {
    return undefined
  }
  if (normalized === '/') {
    return undefined
  }
  if (/^\/\/[^/]+\/[^/]+\/?$/.test(normalized)) {
    return undefined
  }

  const lastSlashIndex = normalized.lastIndexOf('/')
  if (lastSlashIndex === -1) {
    // Bare filename in the current directory
    return undefined
  }

  const parentPath = normalized.slice(0, Math.max(0, lastSlashIndex))
  if (!parentPath) {
    return undefined
  }

  // Return the parent path's last segment
  const lastSlashBeforeParent = parentPath.lastIndexOf('/')
  if (lastSlashBeforeParent === -1) {
    return parentPath
  }
  return parentPath.slice(Math.max(0, lastSlashBeforeParent + 1))
}

/// Check whether a filesystem path is absolute (Windows or Unix).
export function isAbsolutePath(p: string): boolean {
  // Unix: starts with /
  if (p.startsWith('/')) return true
  // Windows: drive letter (C:\, D:\, …)
  if (/^[A-Z]:/i.test(p)) return true
  // UNC: \\server\share
  if (p.startsWith('\\\\')) return true
  return false
}

/// Check whether a string is a URL with a scheme (e.g. `steam://rungameid/1`)
/// rather than a filesystem path — existence/absoluteness checks do not apply.
export function isUrl(p: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(p)
}

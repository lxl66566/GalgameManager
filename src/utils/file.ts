/**
 * Convert a byte size into a human-readable string (KB, MB, GB).
 * @param bytes - File size (bigint)
 * @param decimals - Decimal places, default 1
 */
export const formatBytes = (bytes: bigint, decimals = 1): string => {
  if (bytes === 0n) return '0 B'

  const k = 1024
  const dm = Math.max(decimals, 0)
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']

  // bigint -> number for the log computation; precision loss is negligible
  // for save-file sizes
  const index = Math.floor(Math.log(Number(bytes)) / Math.log(k))

  return `${Number.parseFloat((Number(bytes) / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`
}

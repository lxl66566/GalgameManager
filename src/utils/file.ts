/**
 * 将字节大小转换为人类可读的字符串 (KB, MB, GB)
 * @param bytes - 文件大小 (bigint)
 * @param decimals - 小数位数，默认为 1
 */
export const formatBytes = (bytes: bigint, decimals = 1): string => {
  if (bytes === 0n) return '0 B'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']

  // 将 bigint 转为 number 进行对数运算 (对于游戏存档大小，精度损失可忽略)
  const i = Math.floor(Math.log(Number(bytes)) / Math.log(k))

  return `${parseFloat((Number(bytes) / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

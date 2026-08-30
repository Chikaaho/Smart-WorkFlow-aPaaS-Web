/**
 * 文件大小格式化工具。
 *
 * 将字节数转换为人类可读的 B/KB/MB/GB 表示。
 */

/**
 * 格式化文件大小（字节 → B / KB / MB / GB）。
 *
 * @param bytes — 文件字节数（≥ 0）
 * @returns 格式化后的字符串，如 "1.5 MB"
 *
 * 规则：
 * - bytes < 1024 → "X B"（整数）
 * - bytes < 1024² → "X.X KB"（1 位小数）
 * - bytes < 1024³ → "X.X MB"（1 位小数）
 * - bytes ≥ 1024³ → "X.X GB"（1 位小数）
 * - bytes === 0 → "0 B"
 * - bytes < 0 → "0 B"（容错）
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1)
  const size = bytes / Math.pow(k, i)

  // 整数单位（B）不显示小数；其余保留 1 位小数
  const formatted = i === 0 ? Math.round(size).toString() : size.toFixed(1)
  return `${formatted} ${units[i]}`
}

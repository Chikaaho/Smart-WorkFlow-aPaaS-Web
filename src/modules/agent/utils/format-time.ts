/**
 * 展示层时间格式化（1.1.3/B3）：后端返回 ISO 原值（如 2026-11-14T16:04:57.123），
 * 列表与卡片统一展示为 yyyy-MM-dd HH:mm:ss（不带 T 与微秒），与流程模块列表
 * （InstanceMonitor 等）同一格式。空值显示 '-'；无法解析时按原文截断前 19 位兜底。
 */
export function formatOccurredTime(value: string | null | undefined): string {
  if (!value) return '-'
  const text = String(value)
  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return text.replace('T', ' ').slice(0, 19)
  const pad = (part: number) => String(part).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

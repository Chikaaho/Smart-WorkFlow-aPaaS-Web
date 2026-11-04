/**
 * Token 数值归一化与合计。
 *
 * 后端全局 Jackson 配置把 Long 序列化为字符串（雪花 id 精度保护），Token 计数
 * 同为 Long，因此前端实际收到的是 `"728"` 而不是 `728`。直接相加会变成字符串
 * 拼接（`"728" + "104" = "728104"`），必须先归一化为 number 再计算。
 */

export type TokenValue = number | string | null | undefined

/** 归一化为非负整数；缺失、空串、非数值或负数视为未知（null）。 */
export function toTokenNumber(value: TokenValue): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null
  }
  const text = value.trim()
  if (text === '') return null
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * Token 合计：任一侧未知则整体未知（null），不以 0 代替；两侧均为数值时按数值相加。
 */
export function sumTokens(...values: TokenValue[]): number | null {
  let total = 0
  for (const value of values) {
    const parsed = toTokenNumber(value)
    if (parsed === null) return null
    total += parsed
  }
  return total
}

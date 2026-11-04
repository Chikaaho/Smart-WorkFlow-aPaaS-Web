/**
 * 路由数字 id 归一化：
 * - 普通小 id（测试/存量数据）转 number，保持既有调用语义；
 * - 雪花 id 超出 Number.MAX_SAFE_INTEGER，必须保留字符串，避免精度丢失导致 404。
 */
export function parseRouteId(raw: unknown): number | string {
  const text = typeof raw === 'string' ? raw : String(raw ?? '')
  if (!/^\d+$/.test(text)) return text
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : text
}

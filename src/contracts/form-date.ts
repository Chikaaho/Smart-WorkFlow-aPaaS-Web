/** 将查询返回的带时区时间戳还原为表单使用的本地日期/时间；历史无时区值保持原义。 */
export function normalizeFormDateValue(value: unknown, datetime = false): string {
  const raw = String(value ?? '')
  if (!/[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return raw
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  const pad = (part: number) => String(part).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return datetime
    ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    : day
}

/** 子表更新携带独立行载荷，日期与主表使用同一归一规则。 */
export function normalizeFormDateFields(
  data: Record<string, unknown>,
  fields: readonly { name: string; type: string; format?: string }[],
): Record<string, unknown> {
  const result = { ...data }
  for (const field of fields) {
    if (field.type === 'DATE' && field.name in result) {
      result[field.name] =
        normalizeFormDateValue(result[field.name], field.format === 'datetime') || null
    }
  }
  return result
}

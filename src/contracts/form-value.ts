/** 动态表以JSON列值返回多值字段；填报与详情都还原为控件的数组契约。 */
export function normalizeFormFieldValue(
  field: { type: string; multiple?: boolean },
  raw: unknown,
): unknown {
  if (raw == null || Array.isArray(raw)) return raw
  const arrayType =
    ['MULTISELECT', 'ATTACHMENT', 'IMAGE', 'TABLE'].includes(field.type) ||
    (['USER', 'DEPT', 'DICT'].includes(field.type) && field.multiple === true)
  if (!arrayType || typeof raw !== 'string') return raw
  const text = raw.trim()
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // 保留非法原值，不能把读取失败伪装为空数组。
    }
  }
  if (['USER', 'DEPT', 'MULTISELECT'].includes(field.type)) {
    return text
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
  return raw
}

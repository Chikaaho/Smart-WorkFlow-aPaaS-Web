import type { FormSchemaField } from '@/contracts/form-schema'
import { FORM_GRID_COLUMNS, normalizeFormFieldColSpan } from '@/contracts/form-layout'

export {
  defaultFormFieldColSpan,
  FORM_GRID_COLUMNS,
  isValidFormFieldColSpan,
  normalizeFormFieldColSpan,
} from '@/contracts/form-layout'

/** 当前字段最终用于 CSS/预览排布的列宽。 */
export function getFormFieldColSpan(field: Pick<FormSchemaField, 'type' | 'colSpan'>): number {
  return normalizeFormFieldColSpan(field.colSpan, field.type)
}

/**
 * 按从左到右、从上到下的规则计算行。
 *
 * 渲染层使用同样的 span 规则交给 CSS Grid 自动放置；这个纯函数用于测试和
 * 需要显式行信息的消费方，确保不会出现可被前序字段填充的空洞。
 */
export function packFormGridRows(
  fields: readonly Pick<FormSchemaField, 'type' | 'colSpan'>[],
): number[][] {
  const rows: number[][] = []
  let current: number[] = []
  let used = 0

  for (const field of fields) {
    const span = getFormFieldColSpan(field)
    if (current.length > 0 && used + span > FORM_GRID_COLUMNS) {
      rows.push(current)
      current = []
      used = 0
    }
    current.push(span)
    used += span
  }

  if (current.length > 0) rows.push(current)
  return rows
}

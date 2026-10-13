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

/**
 * 插入 index 处所在行的剩余列数（新字段可占的最大宽度）。
 *
 * 按 fields[0..index-1] 顺序流式累计：跨行起点的字段把累计清零后再加自身。
 * 返回 24-used；行满（used=24）返回 24（作为新行整行插入）。
 * BF20261013-004：拖入预览与落库宽度按此取值，使「拖到两格之间=并排插入」所见即所得。
 */
export function remainingSpanAtInsert(
  fields: readonly Pick<FormSchemaField, 'type' | 'colSpan'>[],
  index: number,
): number {
  let used = 0
  const end = Math.max(0, Math.min(index, fields.length))
  for (let i = 0; i < end; i++) {
    const span = getFormFieldColSpan(fields[i])
    if (used + span > FORM_GRID_COLUMNS) used = 0
    used += span
  }
  const remaining = FORM_GRID_COLUMNS - used
  return remaining > 0 ? remaining : FORM_GRID_COLUMNS
}

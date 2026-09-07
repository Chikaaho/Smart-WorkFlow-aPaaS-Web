/**
 * 表单 24 列布局契约。
 *
 * 这个文件只承载跨适配层与业务渲染层共享的值域规则；具体字段排布仍由
 * modules/form/utils/form-layout.ts 提供纯函数封装。
 */

export const FORM_GRID_COLUMNS = 24 as const
export const DEFAULT_FORM_FIELD_COL_SPAN = 12 as const

/** 富文本与子表默认占满一行，保持 P52 的可读性。 */
export function defaultFormFieldColSpan(type: string): number {
  return type === 'RICH_TEXT' || type === 'TABLE' ? FORM_GRID_COLUMNS : DEFAULT_FORM_FIELD_COL_SPAN
}

/** 只有 1—24 的整数才是可持久化的列宽。 */
export function isValidFormFieldColSpan(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= FORM_GRID_COLUMNS
  )
}

/** 兼容没有布局元数据的旧定义，并把异常值归一到该字段类型的合法默认值。 */
export function normalizeFormFieldColSpan(value: unknown, type: string): number {
  return isValidFormFieldColSpan(value) ? value : defaultFormFieldColSpan(type)
}

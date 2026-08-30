import type { FieldType, FormSchemaField, TableSubField } from '@/contracts/form-schema'
import type { DesignerItem } from './types'
import { nextDesignerItemId } from './types'

/**
 * 子表内部字段 ↔ 画布项 转换（盖层子画布专用纯函数）。
 *
 * 子表作者侧的盖层子画布复用主画布那套（DesignerItem / DesignerCanvas / 配置面板），
 * 但子字段在契约里存为 `TableField.subFields: TableSubField[]`（不递归、无 subFields 键）。
 * 本文件把 subFields 与 DesignerItem[] 互转，承担两件硬事：
 *  1. **类型硬挡**：子表内部只允许六种通用数据字段，REFERENCE/TABLE 一律拒收
 *     （防子表递归，对齐后端 1207；引用为本刀范围外）。进出两个方向都挡。
 *  2. **形状对齐**：写回的 TableSubField 只带契约已有键（name/type/label/required/length/
 *     dictType/renderAs），不漏 UI-only 键（DesignerItem.id 丢弃）。
 *
 * 红线：本文件不碰第四刀的 definition↔items 转换（definition-convert.ts）。顶层 TABLE 字段
 * 的 subFields 由那层 deepClone 原样保全；本层只在盖层进出时做 subFields ↔ items。
 */

/** 子表内部允许的六种通用数据字段（硬挡 REFERENCE 引用与 TABLE 子表，防递归）。 */
export const ALLOWED_SUBFIELD_TYPES = [
  'TEXT',
  'RICH_TEXT',
  'NUMBER',
  'DATE',
  'BOOL',
  'DICT',
] as const

export type AllowedSubFieldType = (typeof ALLOWED_SUBFIELD_TYPES)[number]

/** 是否为允许的子字段类型（类型守卫；REFERENCE/TABLE 返回 false）。 */
export function isAllowedSubFieldType(type: FieldType): type is AllowedSubFieldType {
  return (ALLOWED_SUBFIELD_TYPES as readonly string[]).includes(type)
}

/**
 * TableSubField → DesignerItem 的内层字段。
 * 只搬契约键；DICT 补 dictType（DictField 契约要求，缺省空串供面板再选）。
 */
function subFieldToField(sub: TableSubField): FormSchemaField {
  const field: Record<string, unknown> = {
    name: sub.name,
    type: sub.type,
    required: sub.required ?? false,
  }
  if (sub.label !== undefined) field.label = sub.label
  if (sub.length !== undefined) field.length = sub.length
  if (sub.type === 'DICT') {
    field.dictType = sub.dictType ?? ''
    if (sub.renderAs) field.renderAs = sub.renderAs
  }
  return field as unknown as FormSchemaField
}

/**
 * DesignerItem 的内层字段 → TableSubField。
 * 只产出契约已有键，required=false 等默认值省略，保持入库 JSON 干净；
 * 丢弃 DesignerItem.id（UI-only，不入库）。
 */
function fieldToSubField(field: FormSchemaField): TableSubField {
  const sub: TableSubField = { name: field.name, type: field.type }
  if (field.label !== undefined) sub.label = field.label
  if (field.required) sub.required = true
  if ('length' in field && field.length !== undefined) sub.length = field.length
  if (field.type === 'DICT') {
    sub.dictType = field.dictType
    if (field.renderAs) sub.renderAs = field.renderAs
  }
  return sub
}

/**
 * subFields → DesignerItem[]：盖层打开时播种子画布。
 * 非允许类型（理论上不该出现在 subFields）一律跳过 + warn，不污染子画布。
 */
export function subFieldsToItems(subFields: readonly TableSubField[]): DesignerItem[] {
  return subFields.flatMap<DesignerItem>((sub) => {
    if (!isAllowedSubFieldType(sub.type)) {
      console.warn(
        `[subfield-convert] 跳过子表内不允许的字段类型："${sub.name}"（type: ${sub.type}）`,
      )
      return []
    }
    return [{ id: nextDesignerItemId(), field: subFieldToField(sub) }]
  })
}

/**
 * DesignerItem[] → subFields：盖层返回时写回子表字段。
 * 硬挡：即使有人绕过控件库塞进 REFERENCE/TABLE，这里也拒收 + warn（防递归落库）。
 */
export function itemsToSubFields(items: readonly DesignerItem[]): TableSubField[] {
  return items.flatMap<TableSubField>((item) => {
    if (!isAllowedSubFieldType(item.field.type)) {
      console.warn(
        `[subfield-convert] 拒收子表内不允许的字段类型："${item.field.name}"（type: ${item.field.type}）`,
      )
      return []
    }
    return [fieldToSubField(item.field)]
  })
}

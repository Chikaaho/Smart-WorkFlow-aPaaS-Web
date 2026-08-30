import type { FormSchema, FormSchemaField } from '@/contracts/form-schema'
import type { DesignerItem } from './types'
import { nextDesignerItemId } from './types'

/**
 * DesignerItem[] → FormSchema 单向导出（items → definition）。
 *
 * 红线：只取 field（纯 FormSchemaField），丢弃 DesignerItem.id —— 导出的 JSON 与
 * 后端契约同形，不带任何 UI-only 键。
 */
export function itemsToDefinition(items: DesignerItem[], title: string): FormSchema {
  return {
    title: title.trim() || '未命名表单',
    fields: items.map((it) => it.field),
  }
}

/**
 * FormSchema → DesignerItem[] 逆向还原（definition → items）。
 *
 * 把后端存的 fields 还原成带 UI id 的 DesignerItem 列表，供回显画布。
 * REFERENCE / TABLE 字段照样还原——定义里的数据不丢。
 *
 * 未知 type 的字段会被跳过（console.warn），不阻塞其他字段还原。
 */
export function definitionToItems(schema: FormSchema): DesignerItem[] {
  const knownTypes = new Set<string>([
    'TEXT',
    'RICH_TEXT',
    'NUMBER',
    'DATE',
    'BOOL',
    'DICT',
    'REFERENCE',
    'TABLE',
  ])

  return schema.fields.flatMap<DesignerItem>((field) => {
    if (!knownTypes.has(field.type)) {
      console.warn(
        `[definition-convert] skipping unknown field type: "${field.name}" (type: ${field.type})`,
      )
      return []
    }

    // 深拷贝 field 对象，避免回显后意外共享引用。
    const cloned: FormSchemaField = deepCloneField(field)
    return [{ id: nextDesignerItemId(), field: cloned }]
  })
}

/**
 * 深拷贝 FormSchemaField，确保 REFERENCE/TABLE 的子结构不丢。
 *
 * 使用 JSON round-trip 做深拷贝，因为 FormSchemaField 是纯数据、无函数/Date 等
 * 不可序列化值。性能在此场景可接受（字段数通常 < 100）。
 */
function deepCloneField(field: FormSchemaField): FormSchemaField {
  return JSON.parse(JSON.stringify(field)) as FormSchemaField
}

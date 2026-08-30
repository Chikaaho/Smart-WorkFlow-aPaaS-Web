import { describe, it, expect, vi } from 'vitest'
import {
  subFieldsToItems,
  itemsToSubFields,
  isAllowedSubFieldType,
  ALLOWED_SUBFIELD_TYPES,
} from './subfield-convert'
import type { DesignerItem } from './types'
import type { FormSchemaField, TableSubField } from '@/contracts/form-schema'

/**
 * subfield-convert：子表内部字段 ↔ 画布项 转换 + 类型硬挡。
 *  ① subFieldsToItems：subField 包成 DesignerItem（带 UI id + 内层 field）
 *  ② itemsToSubFields：产出干净 TableSubField（丢 UI id、省默认值、只带契约键）
 *  ③ roundtrip：六种允许类型 subFields → items → subFields 稳定
 *  ④ 硬挡：REFERENCE / TABLE 进出两个方向都被拒收（防递归，对齐后端 1207）
 *  ⑤ isAllowedSubFieldType：六种 true，引用/子表 false
 */

function fieldItem(id: string, field: Partial<FormSchemaField> & { name: string }): DesignerItem {
  return { id, field: { type: 'TEXT', required: false, ...field } as FormSchemaField }
}

describe('subfield-convert', () => {
  it('isAllowedSubFieldType: six simple types true, REFERENCE/TABLE false', () => {
    for (const t of ALLOWED_SUBFIELD_TYPES) expect(isAllowedSubFieldType(t)).toBe(true)
    expect(isAllowedSubFieldType('REFERENCE')).toBe(false)
    expect(isAllowedSubFieldType('TABLE')).toBe(false)
  })

  it('subFieldsToItems wraps each subField with a UI id and inner field; DICT carries dictType', () => {
    const subs: TableSubField[] = [
      { name: 'c1', type: 'TEXT', label: '列1' },
      { name: 'c2', type: 'DICT', dictType: 'status', renderAs: 'radio' },
    ]
    const items = subFieldsToItems(subs)
    expect(items).toHaveLength(2)
    expect(items[0].id).toBeTruthy()
    expect(items[0].field).toMatchObject({ name: 'c1', type: 'TEXT', label: '列1' })
    expect(items[1].field).toMatchObject({
      name: 'c2',
      type: 'DICT',
      dictType: 'status',
      renderAs: 'radio',
    })
  })

  it('itemsToSubFields drops UI id, omits required:false, keeps required:true / label / length / dictType', () => {
    const items: DesignerItem[] = [
      fieldItem('di_1', { name: 'c1', type: 'TEXT', label: '列1', required: false, length: 50 }),
      fieldItem('di_2', { name: 'c2', type: 'NUMBER', required: true }),
      fieldItem('di_3', {
        name: 'c3',
        type: 'DICT',
        dictType: 'status',
        renderAs: 'select',
      } as Partial<FormSchemaField> & { name: string }),
    ]
    const subs = itemsToSubFields(items)
    expect(subs[0]).toEqual({ name: 'c1', type: 'TEXT', label: '列1', length: 50 })
    expect(subs[1]).toEqual({ name: 'c2', type: 'NUMBER', required: true })
    expect(subs[2]).toEqual({ name: 'c3', type: 'DICT', dictType: 'status', renderAs: 'select' })
  })

  it('roundtrip subFields → items → subFields is stable for allowed types', () => {
    const subs: TableSubField[] = [
      { name: 'c1', type: 'TEXT', label: '列1' },
      { name: 'c2', type: 'NUMBER', required: true },
      { name: 'c3', type: 'DICT', dictType: 'status' },
      { name: 'c4', type: 'BOOL' },
    ]
    expect(itemsToSubFields(subFieldsToItems(subs))).toEqual(subs)
  })

  it('itemsToSubFields hard-rejects REFERENCE and TABLE (防递归)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const items: DesignerItem[] = [
      fieldItem('di_1', { name: 'ok', type: 'TEXT' }),
      fieldItem('di_2', { name: 'ref', type: 'REFERENCE' } as Partial<FormSchemaField> & {
        name: string
      }),
      fieldItem('di_3', {
        name: 'tbl',
        type: 'TABLE',
        subFields: [],
      } as Partial<FormSchemaField> & {
        name: string
      }),
    ]
    const subs = itemsToSubFields(items)
    expect(subs.map((s) => s.name)).toEqual(['ok'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('subFieldsToItems skips disallowed types', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const subs = [
      { name: 'ok', type: 'TEXT' },
      { name: 'ref', type: 'REFERENCE' },
    ] as TableSubField[]
    const items = subFieldsToItems(subs)
    expect(items.map((i) => i.field.name)).toEqual(['ok'])
    warn.mockRestore()
  })
})

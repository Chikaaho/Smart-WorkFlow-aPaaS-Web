import { describe, it, expect, vi, afterEach } from 'vitest'
import type { FormSchema } from '@/contracts/form-schema'
import type { DesignerItem } from './types'
import { itemsToDefinition, definitionToItems } from './definition-convert'

describe('definition-convert / itemsToDefinition', () => {
  it('exports empty fields for empty items', () => {
    const schema = itemsToDefinition([], 'Empty')
    expect(schema.title).toBe('Empty')
    expect(schema.fields).toEqual([])
  })

  it('exports title trimmed (whitespace around title)', () => {
    const schema = itemsToDefinition([], '   My Form   ')
    expect(schema.title).toBe('My Form')
  })

  it('exports items fields without ui id', () => {
    const items: DesignerItem[] = [
      { id: 'di_1', field: { name: 'f1', type: 'TEXT', label: 'Field 1', required: true } },
      { id: 'di_2', field: { name: 'f2', type: 'NUMBER', label: 'Field 2', required: false } },
    ]
    const schema = itemsToDefinition(items, 'Test')
    expect(schema.title).toBe('Test')
    expect(schema.fields).toHaveLength(2)
    expect(schema.fields[0]).toEqual({ name: 'f1', type: 'TEXT', label: 'Field 1', required: true })
    expect(schema.fields[1]).toEqual({
      name: 'f2',
      type: 'NUMBER',
      label: 'Field 2',
      required: false,
    })
  })

  it('preserves DICT dictType and renderAs', () => {
    const items: DesignerItem[] = [
      {
        id: 'di_1',
        field: {
          name: 'gender',
          type: 'DICT',
          label: '性别',
          required: true,
          dictType: 'sex',
          renderAs: 'radio',
        },
      },
    ]
    const schema = itemsToDefinition(items, 'F')
    const field = schema.fields[0]
    expect(field.type).toBe('DICT')
    if (field.type === 'DICT') {
      expect(field.dictType).toBe('sex')
      expect(field.renderAs).toBe('radio')
    }
  })

  it('preserves REFERENCE targetFormId', () => {
    const items: DesignerItem[] = [
      {
        id: 'di_1',
        field: {
          name: 'ref_field',
          type: 'REFERENCE',
          label: '关联',
          required: false,
          targetFormId: 'other-form-key',
        },
      },
    ]
    const schema = itemsToDefinition(items, 'F')
    const field = schema.fields[0]
    expect(field.type).toBe('REFERENCE')
    if (field.type === 'REFERENCE') {
      expect(field.targetFormId).toBe('other-form-key')
    }
  })

  it('preserves TABLE subFields fully', () => {
    const items: DesignerItem[] = [
      {
        id: 'di_1',
        field: {
          name: 'items',
          type: 'TABLE',
          label: '明细',
          required: false,
          subFields: [
            { name: 'col1', type: 'TEXT', label: '列1' },
            { name: 'col2', type: 'NUMBER', label: '列2', required: true },
            { name: 'col3', type: 'DICT', label: '列3', dictType: 'status' },
          ],
        },
      },
    ]
    const schema = itemsToDefinition(items, 'F')
    const field = schema.fields[0]
    expect(field.type).toBe('TABLE')
    if (field.type === 'TABLE') {
      expect(field.subFields).toHaveLength(3)
      expect(field.subFields[0]).toEqual({ name: 'col1', type: 'TEXT', label: '列1' })
      expect(field.subFields[1]).toEqual({
        name: 'col2',
        type: 'NUMBER',
        label: '列2',
        required: true,
      })
      expect(field.subFields[2]).toEqual({
        name: 'col3',
        type: 'DICT',
        label: '列3',
        dictType: 'status',
      })
    }
  })

  it('defaults title to 未命名表单 when empty string', () => {
    const schema = itemsToDefinition([], '')
    expect(schema.title).toBe('未命名表单')
  })
})

/* ------------------------------------------------------------------ */
/*  definitionToItems                                                  */
/* ------------------------------------------------------------------ */

describe('definition-convert / definitionToItems', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty array for empty fields', () => {
    const schema: FormSchema = { title: 'Empty', fields: [] }
    expect(definitionToItems(schema)).toEqual([])
  })

  it('wraps each field in a DesignerItem with generated id', () => {
    const schema: FormSchema = {
      title: 'F',
      fields: [
        { name: 'f1', type: 'TEXT', label: 'Field 1', required: true },
        { name: 'f2', type: 'NUMBER', label: 'Field 2', required: false },
      ],
    }
    const items = definitionToItems(schema)
    expect(items).toHaveLength(2)
    expect(items[0].id).toMatch(/^di_\d+$/)
    expect(items[1].id).toMatch(/^di_\d+$/)
    // IDs should be unique
    expect(items[0].id).not.toBe(items[1].id)
    // Field data preserved
    expect(items[0].field).toEqual({ name: 'f1', type: 'TEXT', label: 'Field 1', required: true })
    expect(items[1].field).toEqual({
      name: 'f2',
      type: 'NUMBER',
      label: 'Field 2',
      required: false,
    })
  })

  it('preserves all 8 known field types', () => {
    const schema: FormSchema = {
      title: 'F',
      fields: [
        { name: 'f1', type: 'TEXT' },
        { name: 'f2', type: 'RICH_TEXT' },
        { name: 'f3', type: 'NUMBER' },
        { name: 'f4', type: 'DATE' },
        { name: 'f5', type: 'BOOL' },
        { name: 'f6', type: 'DICT', dictType: 'some_dict' },
        { name: 'f7', type: 'REFERENCE' },
        { name: 'f8', type: 'TABLE', subFields: [] },
      ],
    }
    const items = definitionToItems(schema)
    expect(items).toHaveLength(8)
    const types = items.map((it) => it.field.type)
    expect(types).toEqual([
      'TEXT',
      'RICH_TEXT',
      'NUMBER',
      'DATE',
      'BOOL',
      'DICT',
      'REFERENCE',
      'TABLE',
    ])
  })

  it('preserves REFERENCE targetFormId on roundtrip', () => {
    const schema: FormSchema = {
      title: 'F',
      fields: [{ name: 'ref1', type: 'REFERENCE', targetFormId: 'other-form' }],
    }
    const items = definitionToItems(schema)
    expect(items).toHaveLength(1)
    const field = items[0].field
    expect(field.type).toBe('REFERENCE')
    if (field.type === 'REFERENCE') {
      expect(field.targetFormId).toBe('other-form')
    }
  })

  it('preserves TABLE subFields on roundtrip', () => {
    const schema: FormSchema = {
      title: 'F',
      fields: [
        {
          name: 'tbl',
          type: 'TABLE',
          subFields: [
            { name: 'c1', type: 'TEXT' },
            { name: 'c2', type: 'DICT', dictType: 'status' },
          ],
        },
      ],
    }
    const items = definitionToItems(schema)
    expect(items).toHaveLength(1)
    const field = items[0].field
    expect(field.type).toBe('TABLE')
    if (field.type === 'TABLE') {
      expect(field.subFields).toHaveLength(2)
      expect(field.subFields[0]).toEqual({ name: 'c1', type: 'TEXT' })
      expect(field.subFields[1]).toEqual({ name: 'c2', type: 'DICT', dictType: 'status' })
    }
  })

  it('preserves DICT dictType and renderAs on roundtrip', () => {
    const schema: FormSchema = {
      title: 'F',
      fields: [{ name: 'd1', type: 'DICT', dictType: 'sex', renderAs: 'radio' }],
    }
    const items = definitionToItems(schema)
    expect(items).toHaveLength(1)
    const field = items[0].field
    expect(field.type).toBe('DICT')
    if (field.type === 'DICT') {
      expect(field.dictType).toBe('sex')
      expect(field.renderAs).toBe('radio')
    }
  })

  it('skips unknown field types with console.warn, preserves others', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const schema = {
      title: 'F',
      fields: [
        { name: 'good', type: 'TEXT' },
        { name: 'bad', type: 'XFIELD' },
        { name: 'alsoGood', type: 'BOOL' },
      ],
    } as unknown as FormSchema

    const items = definitionToItems(schema)
    expect(items).toHaveLength(2)
    expect(items[0].field.name).toBe('good')
    expect(items[1].field.name).toBe('alsoGood')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('XFIELD'))
  })

  it('deep clones fields so mutations do not share references', () => {
    const schema: FormSchema = {
      title: 'F',
      fields: [{ name: 'f1', type: 'TEXT', label: 'Original' }],
    }
    const items = definitionToItems(schema)
    // Mutate the returned field
    if (items[0].field.type === 'TEXT') {
      ;(items[0].field as { label?: string }).label = 'Changed'
    }
    // Original schema should be unaffected
    expect(schema.fields[0].label).toBe('Original')
  })

  /* ---- roundtrip: items → definition → items ---- */

  it('roundtrip preserves all field data (items → definition → items)', () => {
    const originalItems: DesignerItem[] = [
      { id: 'di_1', field: { name: 'text_field', type: 'TEXT', label: '文本', required: true } },
      {
        id: 'di_2',
        field: {
          name: 'dict_field',
          type: 'DICT',
          label: '字典',
          required: false,
          dictType: 'sex',
          renderAs: 'radio',
        },
      },
      {
        id: 'di_3',
        field: { name: 'ref_field', type: 'REFERENCE', label: '引用', targetFormId: 'other' },
      },
      {
        id: 'di_4',
        field: {
          name: 'tbl_field',
          type: 'TABLE',
          label: '子表',
          subFields: [{ name: 'sub1', type: 'TEXT', label: '子列1', required: true }],
        },
      },
    ]

    // Export → definition
    const definition = itemsToDefinition(originalItems, 'Roundtrip Test')

    // Import back → items
    const restoredItems = definitionToItems(definition)

    // Same count
    expect(restoredItems).toHaveLength(originalItems.length)

    // Each field should be equal (IDs will differ, which is fine — they're UI-only)
    for (let i = 0; i < originalItems.length; i++) {
      expect(restoredItems[i].field).toEqual(originalItems[i].field)
    }
  })
})

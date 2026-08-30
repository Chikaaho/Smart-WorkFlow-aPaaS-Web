import { describe, it, expect } from 'vitest'
import {
  deriveColumns,
  deriveFilterFields,
  deriveReferenceColumns,
  deriveDisplayField,
  deriveSearchFields,
} from './derive-list-config'
import type { FormSchema, FieldType } from '@/contracts/form-schema'

function createSchema(
  fields: Array<{
    name: string
    label?: string
    type: FieldType
    dictType?: string
    targetFormId?: string
  }>,
): FormSchema {
  return {
    title: 'test-form',
    fields: fields.map((f) => {
      const base = { name: f.name, label: f.label, required: false }
      switch (f.type) {
        case 'DICT':
          return { ...base, type: 'DICT' as const, dictType: f.dictType ?? 'test_dict' }
        case 'REFERENCE':
          return { ...base, type: 'REFERENCE' as const, targetFormId: f.targetFormId }
        default:
          return { ...base, type: f.type as Exclude<FieldType, 'DICT' | 'REFERENCE' | 'TABLE'> }
      }
    }) as FormSchema['fields'],
  }
}

describe('derive-list-config', () => {
  describe('deriveColumns', () => {
    it('returns columns for non-TABLE fields', () => {
      const schema = createSchema([
        { name: 'applicant', label: '申请人', type: 'TEXT' },
        { name: 'days', label: '天数', type: 'NUMBER' },
      ])
      const cols = deriveColumns(schema)
      expect(cols).toHaveLength(3) // 2 fields + create_time
      expect(cols[0].prop).toBe('applicant')
      expect(cols[0].label).toBe('申请人')
      expect(cols[1].prop).toBe('days')
      expect(cols[2].prop).toBe('create_time')
      expect(cols[2].label).toBe('创建时间')
    })

    it('maps REFERENCE field prop to ref_{name}_id', () => {
      const schema = createSchema([{ name: 'relatedRecord', label: '关联单号', type: 'REFERENCE' }])
      const cols = deriveColumns(schema)
      // REFERENCE field + create_time
      expect(cols[0].prop).toBe('ref_relatedRecord_id')
      expect(cols[0].label).toBe('关联单号')
      expect(cols[0].type).toBe('REFERENCE')
    })

    it('excludes TABLE type fields', () => {
      // 直接构建包含 TABLE 字段的 schema
      const tableSchema: FormSchema = {
        title: 'test',
        fields: [
          { name: 'applicant', label: '申请人', type: 'TEXT', required: false },
          {
            name: 'attachments',
            label: '附件',
            type: 'TABLE',
            required: false,
            subFields: [{ name: 'fileName', type: 'TEXT' }],
          },
        ],
      }
      const cols = deriveColumns(tableSchema)
      expect(cols).toHaveLength(2) // 1 field (applicant) + create_time
      expect(cols[0].prop).toBe('applicant')
      expect(cols.find((c) => c.prop === 'attachments')).toBeUndefined()
    })

    it('appends fixed create_time column at the end', () => {
      const schema = createSchema([
        { name: 'a', type: 'TEXT' },
        { name: 'b', type: 'NUMBER' },
        { name: 'c', type: 'DATE' },
      ])
      const cols = deriveColumns(schema)
      const last = cols[cols.length - 1]
      expect(last.prop).toBe('create_time')
      expect(last.label).toBe('创建时间')
    })

    it('carries dictType for DICT columns', () => {
      const schema = createSchema([
        { name: 'dept', label: '部门', type: 'DICT', dictType: 'dept_dict' },
      ])
      const cols = deriveColumns(schema)
      expect(cols[0].dictType).toBe('dept_dict')
    })
  })

  describe('deriveFilterFields', () => {
    it('maps TEXT field to op=LIKE', () => {
      const schema = createSchema([{ name: 'name', type: 'TEXT' }])
      const filters = deriveFilterFields(schema)
      expect(filters[0].op).toBe('LIKE')
      expect(filters[0].field).toBe('name')
    })

    it('maps NUMBER/DATE/BOOL/DICT to op=EQ', () => {
      const schema = createSchema([
        { name: 'age', type: 'NUMBER' },
        { name: 'dt', type: 'DATE' },
        { name: 'flag', type: 'BOOL' },
        { name: 'type', type: 'DICT', dictType: 'my_dict' },
      ])
      const filters = deriveFilterFields(schema)
      for (const f of filters) {
        expect(f.op).toBe('EQ')
      }
    })

    it('excludes REFERENCE, RICH_TEXT, and TABLE fields', () => {
      const schema: FormSchema = {
        title: 'test',
        fields: [
          { name: 'name', type: 'TEXT', required: false },
          { name: 'reason', type: 'RICH_TEXT', required: false },
          { name: 'ref', type: 'REFERENCE', required: false },
          {
            name: 'attachments',
            type: 'TABLE',
            required: false,
            subFields: [{ name: 'fn', type: 'TEXT' }],
          },
        ],
      }
      const filters = deriveFilterFields(schema)
      expect(filters).toHaveLength(1) // only TEXT field
      expect(filters[0].field).toBe('name')
    })

    it('limits to at most 3 filter fields in v1', () => {
      const schema = createSchema([
        { name: 'a', type: 'TEXT' },
        { name: 'b', type: 'TEXT' },
        { name: 'c', type: 'TEXT' },
        { name: 'd', type: 'TEXT' },
        { name: 'e', type: 'TEXT' },
      ])
      const filters = deriveFilterFields(schema)
      expect(filters).toHaveLength(3)
    })

    it('carries dictType for DICT filter fields', () => {
      const schema = createSchema([{ name: 'dept', type: 'DICT', dictType: 'dept_dict' }])
      const filters = deriveFilterFields(schema)
      expect(filters[0].dictType).toBe('dept_dict')
    })

    it('uses field label when label is not set', () => {
      const schema = createSchema([{ name: 'unnamed', type: 'TEXT' }])
      const filters = deriveFilterFields(schema)
      expect(filters[0].label).toBe('unnamed')
    })

    it('uses field.name as label when label is not provided', () => {
      const schema: FormSchema = {
        title: 'test',
        fields: [{ name: 'noLabel', type: 'TEXT', required: false }],
      }
      const filters = deriveFilterFields(schema)
      expect(filters[0].label).toBe('noLabel')
    })

    it('handles empty schema', () => {
      const schema: FormSchema = { title: 'empty', fields: [] }
      expect(deriveFilterFields(schema)).toEqual([])
    })
  })

  /* ═══════════════════════════════════════════════════
   * deriveReferenceColumns
   * ═══════════════════════════════════════════════════ */

  describe('deriveReferenceColumns', () => {
    it('returns same columns as deriveColumns (v1 = delegate)', () => {
      const schema = createSchema([
        { name: 'applicant', label: '申请人', type: 'TEXT' },
        { name: 'dept', label: '部门', type: 'DICT', dictType: 'dept' },
        { name: 'amount', label: '金额', type: 'NUMBER' },
      ])
      const refCols = deriveReferenceColumns(schema)
      const cols = deriveColumns(schema)
      expect(refCols).toEqual(cols)
      expect(refCols.length).toBe(4) // 3 fields + create_time
    })

    it('maps REFERENCE field prop to ref_{name}_id (same as deriveColumns)', () => {
      const schema = createSchema([{ name: 'related', label: '关联', type: 'REFERENCE' }])
      const refCols = deriveReferenceColumns(schema)
      expect(refCols[0].prop).toBe('ref_related_id')
    })
  })

  /* ═══════════════════════════════════════════════════
   * deriveDisplayField
   * ═══════════════════════════════════════════════════ */

  describe('deriveDisplayField', () => {
    it('returns the first TEXT field name', () => {
      const schema = createSchema([
        { name: 'applicant', type: 'TEXT' },
        { name: 'remark', type: 'TEXT' },
        { name: 'amount', type: 'NUMBER' },
      ])
      expect(deriveDisplayField(schema)).toBe('applicant')
    })

    it('skips non-TEXT fields and returns first TEXT', () => {
      const schema = createSchema([
        { name: 'amount', type: 'NUMBER' },
        { name: 'dept', type: 'DICT', dictType: 'dept' },
        { name: 'name', type: 'TEXT' },
      ])
      expect(deriveDisplayField(schema)).toBe('name')
    })

    it('falls back to "id" when no TEXT field exists', () => {
      const schema = createSchema([
        { name: 'amount', type: 'NUMBER' },
        { name: 'flag', type: 'BOOL' },
      ])
      expect(deriveDisplayField(schema)).toBe('id')
    })

    it('falls back to "id" for empty fields', () => {
      const schema: FormSchema = { title: 'empty', fields: [] }
      expect(deriveDisplayField(schema)).toBe('id')
    })
  })

  /* ═══════════════════════════════════════════════════
   * deriveSearchFields
   * ═══════════════════════════════════════════════════ */

  describe('deriveSearchFields', () => {
    it('returns [deriveDisplayField] (v1 = single search field)', () => {
      const schema = createSchema([
        { name: 'applicant', type: 'TEXT' },
        { name: 'remark', type: 'TEXT' },
      ])
      const fields = deriveSearchFields(schema)
      expect(fields).toEqual(['applicant'])
      expect(fields.length).toBe(1)
    })

    it('falls back to ["id"] when no TEXT field', () => {
      const schema = createSchema([{ name: 'amount', type: 'NUMBER' }])
      expect(deriveSearchFields(schema)).toEqual(['id'])
    })
  })
})

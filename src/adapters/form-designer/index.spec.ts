import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseDefinition, toFormCreateRule } from './index'

describe('adapters/form-designer/parseDefinition', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps TEXT field with label and required correctly', () => {
    const raw = JSON.stringify({
      title: 'My Form',
      fields: [{ name: 'username', type: 'TEXT', label: 'User Name', required: true }],
    })
    const schema = parseDefinition(raw)
    expect(schema.title).toBe('My Form')
    expect(schema.fields).toHaveLength(1)
    expect(schema.fields[0]).toEqual({
      name: 'username',
      type: 'TEXT',
      label: 'User Name',
      required: true,
      colSpan: 12,
    })
  })

  it('maps all 8 known field types', () => {
    const raw = JSON.stringify({
      title: 'All Types',
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
    })
    const schema = parseDefinition(raw)
    expect(schema.fields).toHaveLength(8)
    expect(schema.fields.map((f) => f.type)).toEqual([
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

  it('maps DICT field and transparently passes dictType', () => {
    const raw = JSON.stringify({
      title: 'F',
      fields: [{ name: 'sex', type: 'DICT', dictType: 'sys_user_sex' }],
    })
    const schema = parseDefinition(raw)
    const field = schema.fields[0]
    expect(field.type).toBe('DICT')
    if (field.type === 'DICT') {
      expect(field.dictType).toBe('sys_user_sex')
    }
  })

  it('maps TABLE field and transparently passes subFields', () => {
    const raw = JSON.stringify({
      title: 'F',
      fields: [
        {
          name: 'items',
          type: 'TABLE',
          subFields: [
            { name: 'col1', type: 'TEXT' },
            { name: 'col2', type: 'NUMBER' },
          ],
        },
      ],
    })
    const schema = parseDefinition(raw)
    const field = schema.fields[0]
    expect(field.type).toBe('TABLE')
    if (field.type === 'TABLE') {
      expect(field.subFields).toHaveLength(2)
      expect(field.subFields[0]).toEqual({ name: 'col1', type: 'TEXT' })
      expect(field.subFields[1]).toEqual({ name: 'col2', type: 'NUMBER' })
    }
  })

  it('skips TABLE subFields with unknown types', () => {
    const raw = JSON.stringify({
      title: 'F',
      fields: [
        {
          name: 'tbl',
          type: 'TABLE',
          subFields: [
            { name: 'good', type: 'TEXT' },
            { name: 'bad', type: 'XFIELD' },
          ],
        },
      ],
    })
    const schema = parseDefinition(raw)
    const field = schema.fields[0]
    if (field.type === 'TABLE') {
      expect(field.subFields).toHaveLength(1)
      expect(field.subFields[0].name).toBe('good')
    }
  })

  it('skips unknown field types and emits console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const raw = JSON.stringify({
      title: 'F',
      fields: [
        { name: 'known', type: 'TEXT' },
        { name: 'alien', type: 'XFILE' },
      ],
    })
    const schema = parseDefinition(raw)
    expect(schema.fields).toHaveLength(1)
    expect(schema.fields[0].name).toBe('known')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('XFILE'))
  })

  it('throws normalized error on invalid JSON', () => {
    expect(() => parseDefinition('not json')).toThrow(
      '[form-designer] failed to parse definition JSON: invalid format',
    )
  })

  it('throws normalized error when JSON has unexpected shape', () => {
    expect(() => parseDefinition(JSON.stringify({ foo: 'bar' }))).toThrow(
      '[form-designer] failed to parse definition JSON: unexpected shape',
    )
  })

  it('required defaults to false when omitted', () => {
    const raw = JSON.stringify({
      title: 'F',
      fields: [{ name: 'f', type: 'TEXT' }],
    })
    const schema = parseDefinition(raw)
    expect(schema.fields[0].required).toBe(false)
  })

  it('preserves valid colSpan and normalizes invalid or missing layout values', () => {
    const raw = JSON.stringify({
      title: '布局',
      fields: [
        { name: 'one', type: 'TEXT', colSpan: 1 },
        { name: 'full', type: 'RICH_TEXT', colSpan: 24 },
        { name: 'fallback', type: 'TEXT', colSpan: 0 },
        { name: 'legacy', type: 'TEXT' },
      ],
    })
    const schema = parseDefinition(raw)
    expect(schema.fields.map((field) => field.colSpan)).toEqual([1, 24, 12, 12])
  })
})

/* ------------------------------------------------------------------ */
/*  toFormCreateRule                                                   */
/* ------------------------------------------------------------------ */

describe('adapters/form-designer/toFormCreateRule', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /* ---- 8 种类型结构 ---- */

  it('maps TEXT to form-create input rule with title and field', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'username', type: 'TEXT' as const, label: '用户' }],
    }
    const rules = toFormCreateRule(schema)
    expect(rules).toHaveLength(1)

    const r = rules[0] as Record<string, unknown>
    expect(r.type).toBe('input')
    expect(r.title).toBe('用户')
    expect(r.field).toBe('username')
    expect(r.value).toBe('')
  })

  it('maps RICH_TEXT to input with textarea props and TODO note', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'bio', type: 'RICH_TEXT' as const }],
    }
    const rules = toFormCreateRule(schema)
    expect(rules).toHaveLength(1)

    const r = rules[0] as Record<string, unknown>
    expect(r.type).toBe('input')
    expect((r.props as Record<string, unknown>).type).toBe('textarea')
    expect((r.props as Record<string, unknown>).rows).toBe(4)
    expect(r.value).toBe('')
  })

  it('maps NUMBER to inputNumber', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'age', type: 'NUMBER' as const, label: '年龄' }],
    }
    const rules = toFormCreateRule(schema)
    const r = rules[0] as Record<string, unknown>
    expect(r.type).toBe('inputNumber')
    expect(r.title).toBe('年龄')
  })

  it('maps DATE to datePicker with valueFormat YYYY-MM-DD', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'birth', type: 'DATE' as const }],
    }
    const rules = toFormCreateRule(schema)
    const r = rules[0] as Record<string, unknown>
    expect(r.type).toBe('datePicker')
    expect((r.props as Record<string, unknown>).valueFormat).toBe('YYYY-MM-DD')
  })

  it('maps BOOL to switch with value false', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'active', type: 'BOOL' as const }],
    }
    const rules = toFormCreateRule(schema)
    const r = rules[0] as Record<string, unknown>
    expect(r.type).toBe('switch')
    expect(r.value).toBe(false)
  })

  it('maps DICT to select with __dictType__ and empty options', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'gender', type: 'DICT' as const, dictType: 'sys_user_gender' }],
    }
    const rules = toFormCreateRule(schema)
    const r = rules[0] as Record<string, unknown>
    expect(r.type).toBe('select')
    expect(r.options).toEqual([])
    expect((r as Record<string, unknown>).__dictType__).toBe('sys_user_gender')
  })

  it('maps REFERENCE to disabled input as unified button placeholder', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'refId', type: 'REFERENCE' as const }],
    }
    const rules = toFormCreateRule(schema)
    expect(rules).toHaveLength(1)

    const r = rules[0] as Record<string, unknown>
    expect(r.type).toBe('input')
    const props = r.props as Record<string, unknown>
    expect(props.disabled).toBe(true)
    expect(props.placeholder).toContain('引用字段')
  })

  it('maps TABLE to group with children matching subFields count', () => {
    const schema = {
      title: 'F',
      fields: [
        {
          name: 'items',
          type: 'TABLE' as const,
          subFields: [
            { name: 'col1', type: 'TEXT' as const },
            { name: 'col2', type: 'NUMBER' as const },
          ],
        },
      ],
    }
    const rules = toFormCreateRule(schema)
    expect(rules).toHaveLength(1)

    const r = rules[0] as Record<string, unknown>
    expect(r.type).toBe('group')
    expect(r.value).toEqual([])
    expect(r.children).toHaveLength(2)

    const children = r.children as Record<string, unknown>[]
    expect(children[0].type).toBe('input')
    expect(children[0].field).toBe('col1')
    expect(children[1].type).toBe('inputNumber')
    expect(children[1].field).toBe('col2')
  })

  /* ---- required 映射 ---- */

  it('adds validate[{ required }] on rule when field is required', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'req', type: 'TEXT' as const, required: true }],
    }
    const rules = toFormCreateRule(schema)
    const r = rules[0] as Record<string, unknown>
    const validate = r.validate as Array<Record<string, unknown>>
    expect(validate).toBeDefined()
    expect(validate.some((v) => v.required === true)).toBe(true)
  })

  it('omits validate array when field is not required', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'opt', type: 'TEXT' as const, required: false }],
    }
    const rules = toFormCreateRule(schema)
    const r = rules[0] as Record<string, unknown>
    expect(r.validate).toBeUndefined()
  })

  /* ---- label 回退 ---- */

  it('falls back label to name when label is not provided', () => {
    const schema = {
      title: 'F',
      fields: [{ name: 'no_label', type: 'TEXT' as const }],
    }
    const rules = toFormCreateRule(schema)
    const r = rules[0] as Record<string, unknown>
    expect(r.title).toBe('no_label')
  })

  /* ---- DICT 通道：规则携带 dictType ---- */

  it('DICT rule carries dictType for runtime dict loading', () => {
    const schema = {
      title: 'F',
      fields: [
        { name: 'd1', type: 'DICT' as const, dictType: 'sys_dept' },
        { name: 'd2', type: 'DICT' as const, dictType: 'sys_role' },
      ],
    }
    const rules = toFormCreateRule(schema)
    ;(rules as Record<string, unknown>[]).forEach((r, i) => {
      expect(r.type).toBe('select')
      expect(Array.isArray(r.options)).toBe(true)
      expect((r as Record<string, unknown>).__dictType__).toBe(i === 0 ? 'sys_dept' : 'sys_role')
    })
  })

  /* ---- TABLE 子字段完整性 ---- */

  it('TABLE children includes all subFields with correct types', () => {
    const schema = {
      title: 'F',
      fields: [
        {
          name: 'tbl',
          type: 'TABLE' as const,
          subFields: [
            { name: 'a', type: 'TEXT' as const },
            { name: 'b', type: 'NUMBER' as const },
            { name: 'c', type: 'DATE' as const },
            { name: 'd', type: 'BOOL' as const },
          ],
        },
      ],
    }
    const rules = toFormCreateRule(schema)
    const children = (rules[0] as Record<string, unknown>).children as Record<string, unknown>[]
    expect(children).toHaveLength(4)
    expect(children[0].type).toBe('input')
    expect(children[1].type).toBe('inputNumber')
    expect(children[2].type).toBe('datePicker')
    expect(children[3].type).toBe('switch')
  })

  /* ── TABLE 子字段 DICT ── */

  it('TABLE children DICT sub-field maps to select with __dictType__', () => {
    const schema = {
      title: 'F',
      fields: [
        {
          name: 'tbl',
          type: 'TABLE' as const,
          subFields: [{ name: 'col', type: 'DICT' as const, dictType: 'sys_dept' }],
        },
      ],
    }
    const rules = toFormCreateRule(schema)
    const children = (rules[0] as Record<string, unknown>).children as Record<string, unknown>[]
    expect(children).toHaveLength(1)
    expect(children[0].type).toBe('select')
    expect(children[0].options).toEqual([])
    expect((children[0] as Record<string, unknown>).__dictType__).toBe('sys_dept')
  })

  it('TABLE children DICT sub-field with renderAs="radio" passes renderAs metadata', () => {
    const schema = {
      title: 'F',
      fields: [
        {
          name: 'tbl',
          type: 'TABLE' as const,
          subFields: [
            { name: 'col', type: 'DICT' as const, dictType: 'sys_sex', renderAs: 'radio' as const },
          ],
        },
      ],
    }
    const rules = toFormCreateRule(schema)
    const children = (rules[0] as Record<string, unknown>).children as Record<string, unknown>[]
    expect(children[0].type).toBe('select')
    expect((children[0] as Record<string, unknown>).renderAs).toBe('radio')
  })

  it('TABLE children DICT sub-field without renderAs omits renderAs metadata', () => {
    const schema = {
      title: 'F',
      fields: [
        {
          name: 'tbl',
          type: 'TABLE' as const,
          subFields: [{ name: 'col', type: 'DICT' as const, dictType: 'sys_role' }],
        },
      ],
    }
    const rules = toFormCreateRule(schema)
    const children = (rules[0] as Record<string, unknown>).children as Record<string, unknown>[]
    expect((children[0] as Record<string, unknown>).renderAs).toBeUndefined()
  })

  it('TABLE children REFERENCE sub-field falls back to input', () => {
    const schema = {
      title: 'F',
      fields: [
        {
          name: 'tbl',
          type: 'TABLE' as const,
          subFields: [{ name: 'col', type: 'REFERENCE' as const }],
        },
      ],
    }
    const rules = toFormCreateRule(schema)
    const children = (rules[0] as Record<string, unknown>).children as Record<string, unknown>[]
    expect(children[0].type).toBe('input')
  })

  it('TABLE children TABLE sub-field falls back to input (no recursion)', () => {
    const schema = {
      title: 'F',
      fields: [
        {
          name: 'tbl',
          type: 'TABLE' as const,
          subFields: [{ name: 'col', type: 'TABLE' as const }],
        },
      ],
    }
    const rules = toFormCreateRule(schema)
    const children = (rules[0] as Record<string, unknown>).children as Record<string, unknown>[]
    expect(children[0].type).toBe('input')
  })

  /* ---- 未知 type 跳过 + 告警 ---- */

  it('skips unknown field type with console.warn, does not break other fields', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const schema = {
      title: 'F',
      fields: [
        { name: 'good', type: 'TEXT' as const },
        { name: 'bad' as string, type: 'XFILE' },
        { name: 'alsoGood', type: 'BOOL' as const },
      ],
    }
    // 用宽类型来模拟运行时非契约数据
    const rules = toFormCreateRule(schema as import('@/contracts/form-schema').FormSchema)
    expect(rules).toHaveLength(2)
    expect((rules[0] as Record<string, unknown>).field).toBe('good')
    expect((rules[1] as Record<string, unknown>).field).toBe('alsoGood')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('XFILE'))
  })

  /* ---- 空 schema ---- */

  it('returns empty array for empty fields', () => {
    const schema = { title: 'Empty', fields: [] }
    const rules = toFormCreateRule(schema)
    expect(rules).toEqual([])
  })

  /* ---- 全部 8 种类型一次过 ---- */

  it('produces one rule per field for all 8 known types', () => {
    const schema = {
      title: 'All',
      fields: [
        { name: 'f1', type: 'TEXT' as const },
        { name: 'f2', type: 'RICH_TEXT' as const },
        { name: 'f3', type: 'NUMBER' as const },
        { name: 'f4', type: 'DATE' as const },
        { name: 'f5', type: 'BOOL' as const },
        { name: 'f6', type: 'DICT' as const, dictType: 'd' },
        { name: 'f7', type: 'REFERENCE' as const },
        { name: 'f8', type: 'TABLE' as const, subFields: [] },
      ],
    }
    const rules = toFormCreateRule(schema)
    expect(rules).toHaveLength(8)
    const types = (rules as Record<string, unknown>[]).map((r) => r.type)
    expect(types).toEqual([
      'input',
      'input',
      'inputNumber',
      'datePicker',
      'switch',
      'select',
      'input',
      'group',
    ])
  })
})

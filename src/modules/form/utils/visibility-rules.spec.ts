import { describe, it, expect } from 'vitest'
import { parseVisibilityRules, hiddenFieldNames } from './visibility-rules'
import type { FormSchema, VisibilityRule } from '@/contracts/form-schema'

describe('visibility-rules（渲染侧显隐求值）', () => {
  const schema: FormSchema = {
    title: 't',
    fields: [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'TEXT' },
      { name: 'c', type: 'MULTISELECT', options: ['x', 'y'] },
    ],
    rules: {
      visibility: [
        { target: 'b', logic: 'ALL', conditions: [{ field: 'a', op: 'EQ', value: 'show' }] },
      ],
    },
  }

  it('parseVisibilityRules 提取规则；无规则返回空', () => {
    expect(parseVisibilityRules(schema)).toHaveLength(1)
    expect(parseVisibilityRules({ title: 't', fields: [] })).toEqual([])
  })

  it('EQ 满足时可见，不满足时隐藏', () => {
    const rules = parseVisibilityRules(schema)
    expect(hiddenFieldNames(rules, { a: 'show' }).has('b')).toBe(false)
    expect(hiddenFieldNames(rules, { a: 'hide' }).has('b')).toBe(true)
    expect(hiddenFieldNames(rules, {}).has('b')).toBe(true)
  })

  it('ANY 逻辑任一满足即可见', () => {
    const rules: VisibilityRule[] = [
      {
        target: 'b',
        logic: 'ANY',
        conditions: [
          { field: 'a', op: 'EQ', value: 'x' },
          { field: 'c', op: 'NOT_EMPTY', value: undefined },
        ],
      },
    ]
    expect(hiddenFieldNames(rules, { a: 'no' }).has('b')).toBe(true)
    expect(hiddenFieldNames(rules, { a: 'no', c: ['x'] }).has('b')).toBe(false)
  })

  it('EMPTY/NE 口径：空串与缺失均视为空', () => {
    const rules: VisibilityRule[] = [
      { target: 'b', logic: 'ALL', conditions: [{ field: 'a', op: 'EMPTY' }] },
    ]
    expect(hiddenFieldNames(rules, { a: '' }).has('b')).toBe(false)
    expect(hiddenFieldNames(rules, { a: 'v' }).has('b')).toBe(true)

    const neRules: VisibilityRule[] = [
      { target: 'b', logic: 'ALL', conditions: [{ field: 'a', op: 'NE', value: 'v' }] },
    ]
    // 空值时 NE 视为满足（空值不等于任何给定值）
    expect(hiddenFieldNames(neRules, { a: '' }).has('b')).toBe(false)
    expect(hiddenFieldNames(neRules, { a: 'v' }).has('b')).toBe(true)
  })
})

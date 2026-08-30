import { describe, it, expect } from 'vitest'
import { applyFieldPatch, type FieldPatch } from './field-config'
import type { DictField, TextField } from '@/contracts/form-schema'

describe('field-config', () => {
  it('applyFieldPatch merges contract keys in place (single source, same object ref)', () => {
    const field: TextField = { name: 'col_a', type: 'TEXT', label: '旧标签', required: false }
    applyFieldPatch(field, { label: '新标签', name: 'col_b', required: true, length: 50 })
    expect(field).toEqual({
      name: 'col_b',
      type: 'TEXT',
      label: '新标签',
      required: true,
      length: 50,
    })
  })

  it('applyFieldPatch writes DICT-specific keys (dictType / renderAs)', () => {
    const field: DictField = {
      name: 'd',
      type: 'DICT',
      label: '字典',
      required: false,
      dictType: '',
    }
    applyFieldPatch(field, { dictType: 'dept', renderAs: 'radio' })
    expect(field.dictType).toBe('dept')
    expect(field.renderAs).toBe('radio')
  })

  it('FieldPatch carries only existing schema keys (compile-time guard against dirty keys)', () => {
    // 仅契约已有键可进补丁；占位/默认值/min/max 等无契约键无法出现在此对象，
    // 一旦有人想塞自造键，TypeScript 编译期即报错（本断言锁住允许键集合）。
    const patch: FieldPatch = {
      label: 'x',
      name: 'y',
      required: true,
      length: 1,
      dictType: 'z',
      renderAs: 'select',
      targetFormId: 'my-form-key',
    }
    expect(Object.keys(patch).sort()).toEqual(
      ['dictType', 'label', 'length', 'name', 'renderAs', 'required', 'targetFormId'].sort(),
    )
  })

  it('targetFormId stores formKey not id (red line: selecting form fills formKey, never UUID)', () => {
    // 红线：选择器选中一行后，回填进 targetFormId 的必须是 formKey，绝不能存成 id。
    // 这个测试钉死该行为——把 id 当 targetFormId 塞入就会在对照 formKey 断言时失败。
    const field: import('@/contracts/form-schema').ReferenceField = {
      name: 'ref1',
      type: 'REFERENCE',
      label: '关联',
      required: false,
    }
    // 模拟选择器回填：选中行的 formKey = 'leave-request'
    applyFieldPatch(field, { targetFormId: 'leave-request' })
    expect(field.targetFormId).toBe('leave-request')
    // 红线断言：targetFormId 必须是 formKey 样子（短横线 slug），不是 UUID
    expect(field.targetFormId).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })

  it('applyFieldPatch writes targetFormId to REFERENCE field', () => {
    const field: import('@/contracts/form-schema').ReferenceField = {
      name: 'ref1',
      type: 'REFERENCE',
      label: '关联',
      required: false,
    }
    applyFieldPatch(field, { targetFormId: 'purchase-order', label: '采购关联' })
    expect(field.targetFormId).toBe('purchase-order')
    expect(field.label).toBe('采购关联')
  })
})

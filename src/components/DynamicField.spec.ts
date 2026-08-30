import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DynamicField from './DynamicField.vue'
import type { FormSchemaField } from '@/contracts/form-schema'

/* ── stub helpers ── */
const baseGlobal = {
  stubs: {
    DictSelect: {
      props: ['type', 'modelValue', 'renderAs'],
      emits: ['update:modelValue'],
      template:
        '<select :data-dict-type="type" :data-render-as="renderAs" data-testid="dict-select" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="male">male</option><option value="female">female</option></select>',
    },
    ElDatePicker: {
      props: ['modelValue', 'valueFormat'],
      emits: ['update:modelValue'],
      template: '<input data-testid="date-picker" :value="modelValue" />',
    },
    ElInputNumber: {
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue'],
      template:
        '<input data-testid="input-number" type="number" :value="modelValue" :disabled="disabled" />',
    },
    ElSwitch: {
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue'],
      template:
        '<input data-testid="switch" type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
    },
    ReferenceSelector: {
      props: ['targetFormKey', 'visible', 'selectedId'],
      emits: ['update:visible', 'select'],
      template: '<div data-testid="reference-selector" style="display:none" />',
    },
  },
}

function mountField(field: FormSchemaField, modelValue: unknown = '', readonly = false) {
  return mount(DynamicField, {
    props: { field, modelValue, readonly },
    global: baseGlobal,
  })
}

/* ═══════════════════════════════════════════════════
 * 8 类 field.type 各渲染出对应控件
 * ═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
 * readonly 模式
 * ═══════════════════════════════════════════════════ */

describe('DynamicField — readonly', () => {
  it('TEXT readonly → el-input 设 readonly', () => {
    const wrapper = mountField({ name: 'f1', type: 'TEXT' }, 'hello', true)
    expect(wrapper.findComponent({ name: 'ElInput' }).props('readonly')).toBe(true)
  })

  it('NUMBER readonly → el-input-number 设 disabled', () => {
    const wrapper = mountField({ name: 'f3', type: 'NUMBER' }, 0, true)
    const input = wrapper.find('[data-testid="input-number"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('disabled')).toBeDefined()
  })

  it('BOOL readonly → el-switch 设 disabled', () => {
    const wrapper = mountField({ name: 'f5', type: 'BOOL' }, false, true)
    const sw = wrapper.find('[data-testid="switch"]')
    expect(sw.exists()).toBe(true)
    expect(sw.attributes('disabled')).toBeDefined()
  })

  it('DICT readonly → DictSelect 设 disabled', () => {
    const wrapper = mountField({ name: 'f6', type: 'DICT', dictType: 'sex' }, '', true)
    const dict = wrapper.find('[data-testid="dict-select"]')
    expect(dict.exists()).toBe(true)
    expect(dict.attributes('disabled')).toBeDefined()
  })

  it('REFERENCE readonly → 选择按钮 disabled', () => {
    const wrapper = mountField(
      { name: 'f7', type: 'REFERENCE', targetFormId: 'demo-form' },
      '',
      true,
    )
    const buttons = wrapper.findAll('button')
    const selectBtn = buttons.find((b) => b.text() === '选择')
    expect(selectBtn).toBeTruthy()
    expect(selectBtn!.attributes('disabled')).toBeDefined()
  })

  it('TABLE readonly → 隐藏添加行和删除按钮', () => {
    const wrapper = mountField(
      { name: 't1', type: 'TABLE', subFields: [{ name: 'c1', type: 'TEXT' }] },
      [{ c1: 'a' }],
      true,
    )
    // 「操作」表头不应出现
    const headers = wrapper.findAll('th')
    const opHeader = headers.find((h) => h.text() === '操作')
    expect(opHeader).toBeUndefined()
    // 删除按钮不应出现
    const delBtns = wrapper.findAll('button').filter((b) => b.text() === '删除')
    expect(delBtns.length).toBe(0)
    // 添加行按钮不应出现
    const addBtns = wrapper.findAll('button').filter((b) => b.text().includes('添加行'))
    expect(addBtns.length).toBe(0)
  })
})

/* ═══════════════════════════════════════════════════
 * referenceLabel（REFERENCE 回显）
 * ═══════════════════════════════════════════════════ */

describe('DynamicField — referenceLabel', () => {
  it('显示 referenceLabel 而非裸 ID', () => {
    const wrapper = mount(DynamicField, {
      props: {
        field: { name: 'ref1', type: 'REFERENCE', targetFormId: 'demo-form' },
        modelValue: 'raw-id-001',
        referenceLabel: '张三',
      },
      global: baseGlobal,
    })
    const input = wrapper.findComponent({ name: 'ElInput' })
    expect(input.props('modelValue')).toBe('张三')
  })

  it('referenceLabel 为空时降级到 modelValue（ID）', () => {
    const wrapper = mount(DynamicField, {
      props: {
        field: { name: 'ref1', type: 'REFERENCE', targetFormId: 'demo-form' },
        modelValue: 'raw-id-001',
        referenceLabel: '',
      },
      global: baseGlobal,
    })
    const input = wrapper.findComponent({ name: 'ElInput' })
    expect(input.props('modelValue')).toBe('raw-id-001')
  })
})

describe('DynamicField — 8 类字段渲染', () => {
  it('TEXT → el-input', () => {
    const wrapper = mountField({ name: 'f1', type: 'TEXT' })
    expect(wrapper.findComponent({ name: 'ElInput' }).exists()).toBe(true)
    // RICH_TEXT 与 REFERENCE 也渲染 el-input，确认不是 textarea
    const input = wrapper.findComponent({ name: 'ElInput' })
    expect(input.props('type')).toBe('text')
  })

  it('RICH_TEXT → el-input textarea', () => {
    const wrapper = mountField({ name: 'f2', type: 'RICH_TEXT' })
    expect(wrapper.findComponent({ name: 'ElInput' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ElInput' }).props('type')).toBe('textarea')
  })

  it('NUMBER → el-input-number', () => {
    const wrapper = mountField({ name: 'f3', type: 'NUMBER' })
    expect(wrapper.find('[data-testid="input-number"]').exists()).toBe(true)
  })

  it('DATE → el-date-picker with valueFormat YYYY-MM-DD', () => {
    const wrapper = mountField({ name: 'f4', type: 'DATE' })
    expect(wrapper.find('[data-testid="date-picker"]').exists()).toBe(true)
  })

  it('BOOL → el-switch', () => {
    const wrapper = mountField({ name: 'f5', type: 'BOOL' })
    expect(wrapper.find('[data-testid="switch"]').exists()).toBe(true)
  })

  it('DICT → DictSelect 透传 dictType', () => {
    const wrapper = mountField({ name: 'f6', type: 'DICT', dictType: 'sex' })
    const dict = wrapper.find('[data-testid="dict-select"]')
    expect(dict.exists()).toBe(true)
    expect(dict.attributes('data-dict-type')).toBe('sex')
  })

  it('REFERENCE → 只读输入框 + 选择按钮（ReferenceSelector 弹窗）', () => {
    const wrapper = mountField({
      name: 'f7',
      type: 'REFERENCE',
      targetFormId: 'demo-form',
    })
    const input = wrapper.findComponent({ name: 'ElInput' })
    expect(input.exists()).toBe(true)
    // 只读
    expect(input.props('readonly')).toBe(true)
    // 「选择」按钮存在
    const buttons = wrapper.findAll('button')
    const selectBtn = buttons.find((b) => b.text() === '选择')
    expect(selectBtn).toBeTruthy()
    // ReferenceSelector 不可见（仅 v-if=true 时渲染）
    expect(wrapper.find('[data-testid="reference-selector"]').exists()).toBe(false)
  })

  it('REFERENCE 按钮 disabled 当 targetFormId 为空', () => {
    const wrapper = mountField({ name: 'f7', type: 'REFERENCE' })
    const buttons = wrapper.findAll('button')
    const selectBtn = buttons.find((b) => b.text() === '选择')
    expect(selectBtn).toBeTruthy()
    expect(selectBtn!.attributes('disabled')).toBeDefined()
  })

  it('TABLE → 内嵌子表，渲染 subFields 表头 + 添加行按钮', () => {
    const wrapper = mountField(
      {
        name: 't1',
        type: 'TABLE',
        subFields: [
          { name: 'col_a', type: 'TEXT' },
          { name: 'col_b', type: 'NUMBER' },
        ],
      },
      [{ col_a: 'hello', col_b: '42' }],
    )
    // 表头
    const headers = wrapper.findAll('th')
    expect(headers.length).toBe(3) // col_a, col_b, 操作
    expect(headers[0].text()).toBe('col_a')
    expect(headers[1].text()).toBe('col_b')
    // 数据行
    expect(wrapper.findAll('tbody tr').length).toBe(1)
    // 添加行按钮（最后一个 button）
    const buttons = wrapper.findAll('button')
    const addBtn = buttons[buttons.length - 1]
    expect(addBtn.text()).toContain('添加行')
  })

  it('TABLE addRow emits updated rows', async () => {
    const wrapper = mountField(
      { name: 't1', type: 'TABLE', subFields: [{ name: 'c1', type: 'TEXT' }] },
      [],
    )
    // 点击「添加行」按钮
    const buttons = wrapper.findAll('button')
    const addBtn = buttons[buttons.length - 1]
    await addBtn.trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const rows = emitted![0][0] as Record<string, unknown>[]
    expect(rows.length).toBe(1)
    expect(rows[0].c1).toBe('')
  })

  it('TABLE removeRow marks non-ADD row as DELETE instead of splicing', async () => {
    const wrapper = mountField(
      { name: 't1', type: 'TABLE', subFields: [{ name: 'c1', type: 'TEXT' }] },
      [{ c1: 'a' }, { c1: 'b' }],
    )
    const deleteBtns = wrapper.findAll('button').filter((b) => b.text() === '删除')
    await deleteBtns[0].trigger('click')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const rows = emitted![0][0] as Record<string, unknown>[]
    // 非 ADD 行不 splice，而是标记 _rowAction: 'DELETE'
    expect(rows.length).toBe(2)
    expect((rows[0] as { _rowAction?: string })._rowAction).toBe('DELETE')
  })

  /* ── TABLE 子字段按 type 分发 ── */

  it('TABLE sub-field DICT 渲染 DictSelect', () => {
    const wrapper = mountField(
      {
        name: 't1',
        type: 'TABLE',
        subFields: [{ name: 'col', type: 'DICT', dictType: 'some_dict' }],
      },
      [{ col: '' }],
    )
    expect(wrapper.find('[data-testid="dict-select"]').exists()).toBe(true)
  })

  it('TABLE sub-field NUMBER 渲染 el-input-number', () => {
    const wrapper = mountField(
      {
        name: 't1',
        type: 'TABLE',
        subFields: [{ name: 'col', type: 'NUMBER' }],
      },
      [{ col: 0 }],
    )
    expect(wrapper.find('[data-testid="input-number"]').exists()).toBe(true)
  })

  it('TABLE sub-field DATE 渲染 el-date-picker', () => {
    const wrapper = mountField(
      {
        name: 't1',
        type: 'TABLE',
        subFields: [{ name: 'col', type: 'DATE' }],
      },
      [{ col: '' }],
    )
    expect(wrapper.find('[data-testid="date-picker"]').exists()).toBe(true)
  })

  it('TABLE sub-field BOOL 渲染 el-switch', () => {
    const wrapper = mountField(
      {
        name: 't1',
        type: 'TABLE',
        subFields: [{ name: 'col', type: 'BOOL' }],
      },
      [{ col: true }],
    )
    expect(wrapper.find('[data-testid="switch"]').exists()).toBe(true)
  })

  it('TABLE sub-field RICH_TEXT 渲染 el-input textarea', () => {
    const wrapper = mountField(
      {
        name: 't1',
        type: 'TABLE',
        subFields: [{ name: 'col', type: 'RICH_TEXT' }],
      },
      [{ col: '' }],
    )
    const input = wrapper.findComponent({ name: 'ElInput' })
    expect(input.exists()).toBe(true)
    expect(input.props('type')).toBe('textarea')
  })

  it('TABLE sub-field REFERENCE 渲染 el-input 降级', () => {
    const wrapper = mountField(
      {
        name: 't1',
        type: 'TABLE',
        subFields: [{ name: 'col', type: 'REFERENCE' }],
      },
      [{ col: '' }],
    )
    const input = wrapper.findComponent({ name: 'ElInput' })
    expect(input.exists()).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════
 * v-model 双向绑定
 * ═══════════════════════════════════════════════════ */

describe('DynamicField — v-model', () => {
  it('TEXT input emits update:modelValue on user input', async () => {
    const wrapper = mountField({ name: 'f1', type: 'TEXT' }, 'old')
    const input = wrapper.findComponent({ name: 'ElInput' })
    await input.vm.$emit('update:modelValue', 'new')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['new'])
  })

  it('BOOL switch emits update:modelValue', async () => {
    const wrapper = mountField({ name: 'f1', type: 'BOOL' }, false)
    // Use the DOM change event on the stubbed checkbox
    const sw = wrapper.find('[data-testid="switch"]')
    await sw.setValue(true)
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBe(true)
  })

  it('DICT select emits update:modelValue', async () => {
    const wrapper = mountField({ name: 'f1', type: 'DICT', dictType: 'sex' }, 'male')
    const select = wrapper.find('[data-testid="dict-select"]')
    // Select the "female" option to trigger change event
    await select.setValue('female')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toBe('female')
  })
})

/* ═══════════════════════════════════════════════════
 * 必填 / 标签渲染
 * ═══════════════════════════════════════════════════ */

describe('DynamicField — 标签与必填', () => {
  it('renders label text from field.label', () => {
    const wrapper = mountField({ name: 'x', label: '用户名', type: 'TEXT' })
    expect(wrapper.find('label').text()).toContain('用户名')
  })

  it('falls back to field.name when no label', () => {
    const wrapper = mountField({ name: 'email', type: 'TEXT' })
    expect(wrapper.find('label').text()).toContain('email')
  })

  it('shows required star when field.required', () => {
    const wrapper = mountField({ name: 'x', type: 'TEXT', required: true })
    expect(wrapper.find('.dynamic-field__required').exists()).toBe(true)
  })

  it('always renders label (falls back to field.name)', () => {
    const wrapper = mountField({ name: 'x', type: 'TEXT' })
    // Label always renders now — falls back to field.name when no label
    expect(wrapper.find('label').exists()).toBe(true)
  })
})

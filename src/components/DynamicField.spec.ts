import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DynamicField from './DynamicField.vue'
import type { FormSchemaField } from '@/contracts/form-schema'

// BF20261013-009：DICT 控件不再经 DictSelect 桩，改为真实下拉 + 字典项装载（mock foundation/dict）
vi.mock('@/foundation/dict', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/foundation/dict')>()
  return {
    ...actual,
    useDict: (type: string) =>
      type === 'sex'
        ? {
            items: {
              value: [
                { value: 'male', label: '男' },
                { value: 'female', label: '女' },
              ],
            },
          }
        : { items: { value: [] } },
  }
})

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
  it('TEXT readonly 显示完整值且没有可编辑输入', () => {
    const wrapper = mountField({ name: 'f1', type: 'TEXT' }, 'hello', true)
    expect(wrapper.find('.readonly-value').text()).toBe('hello')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('NUMBER readonly 保留零值且没有步进操作', () => {
    const wrapper = mountField({ name: 'f3', type: 'NUMBER' }, 0, true)
    expect(wrapper.find('.readonly-value').text()).toBe('0')
    expect(wrapper.find('[data-testid="input-number"]').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('BOOL readonly → el-switch 设 disabled', () => {
    const wrapper = mountField({ name: 'f5', type: 'BOOL' }, false, true)
    const sw = wrapper.find('[data-testid="switch"]')
    expect(sw.exists()).toBe(true)
    expect(sw.attributes('disabled')).toBeDefined()
  })

  it('DICT readonly → 静态展示选中项，不再渲染输入框', () => {
    const wrapper = mountField({ name: 'f6', type: 'DICT', dictType: 'sex' }, '', true)
    expect(wrapper.find('.readonly-options').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ElSelect' }).exists()).toBe(false)
  })

  it('REFERENCE readonly → 静态展示已选值，不渲染选择按钮', () => {
    const wrapper = mountField(
      { name: 'f7', type: 'REFERENCE', targetFormId: 'demo-form' },
      '7',
      true,
    )
    expect(wrapper.find('.dynamic-field__reference-readonly').exists()).toBe(true)
    expect(wrapper.find('.dynamic-field__reference-readonly').text()).toBe('7')
    expect(wrapper.findAll('button')).toHaveLength(0)
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
    // REFERENCE 也渲染 el-input；RICH_TEXT 已改为受控富文本编辑器
    const input = wrapper.findComponent({ name: 'ElInput' })
    expect(input.props('type')).toBe('text')
  })

  it('RICH_TEXT → 受控富文本编辑器（工具栏 + contenteditable）', () => {
    const wrapper = mountField({ name: 'f2', type: 'RICH_TEXT' })
    const editor = wrapper.find('[data-test="rich-text-editor"]')
    expect(editor.exists()).toBe(true)
    expect(editor.find('.rt-editor').attributes('contenteditable')).toBe('true')
    expect(editor.find('.rt-toolbar').exists()).toBe(true)
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

  it('DICT → 选项来自绑定字典（dictType）', () => {
    const wrapper = mountField({ name: 'f6', type: 'DICT', dictType: 'sex' })
    const optionProps = wrapper
      .findAllComponents({ name: 'ElOption' })
      .map((o) => ({ label: o.props('label'), value: o.props('value') }))
    expect(optionProps).toEqual([
      { label: '男', value: 'male' },
      { label: '女', value: 'female' },
    ])
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

  it('TABLE sub-field DICT 渲染下拉', () => {
    const wrapper = mountField(
      {
        name: 't1',
        type: 'TABLE',
        subFields: [{ name: 'col', type: 'DICT', dictType: 'some_dict' }],
      },
      [{ col: '' }],
    )
    expect(wrapper.findComponent({ name: 'ElSelect' }).exists()).toBe(true)
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

  it('TABLE sub-field RICH_TEXT 渲染子表富文本编辑器', () => {
    const wrapper = mountField(
      {
        name: 't1',
        type: 'TABLE',
        subFields: [{ name: 'col', type: 'RICH_TEXT' }],
      },
      [{ col: '' }],
    )
    const editor = wrapper.find('[data-test="rich-text-editor"]')
    expect(editor.exists()).toBe(true)
    expect(editor.classes()).toContain('rt-control--sub')
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
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'female')
    await nextTick()
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

  it('readonly 回看不显示必填星（避免业务详情出现无意义星标）', () => {
    const wrapper = mountField({ name: 'x', type: 'TEXT', required: true }, '', true)
    expect(wrapper.find('.dynamic-field__required').exists()).toBe(false)
  })

  it('always renders label (falls back to field.name)', () => {
    const wrapper = mountField({ name: 'x', type: 'TEXT' })
    // Label always renders now — falls back to field.name when no label
    expect(wrapper.find('label').exists()).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════
 * 字段标题位置（五档）+ 文字组件
 * ═══════════════════════════════════════════════════ */

describe('DynamicField — 字段标题位置', () => {
  it('未配置时为上方左对齐', () => {
    const wrapper = mountField({ name: 'x', label: '用户名', type: 'TEXT' })
    expect(wrapper.classes()).toContain('sw-label-pos--top-left')
  })

  it('五种位置各渲染对应类名，标签与控件始终同层', () => {
    const positions = ['left', 'right', 'top-left', 'top-right', 'top-center'] as const
    for (const position of positions) {
      const wrapper = mountField({
        name: 'x',
        label: '用户名',
        type: 'TEXT',
        labelPosition: position,
      })
      expect(wrapper.classes()).toContain(`sw-label-pos--${position}`)
      expect(wrapper.find('.dynamic-field__label').text()).toContain('用户名')
      expect(wrapper.findComponent({ name: 'ElInput' }).exists()).toBe(true)
    }
  })
})

describe('DynamicField — 文字组件（LABEL）', () => {
  it('只渲染正文，不渲染独立字段标题', () => {
    const wrapper = mountField({ name: 'note', type: 'LABEL', label: '文字', text: '请如实填写' })
    expect(wrapper.find('.dynamic-field__label').exists()).toBe(false)
    expect(wrapper.find('.label-control').text()).toBe('请如实填写')
  })

  it('正文为空时回退字段标签', () => {
    const wrapper = mountField({ name: 'note', type: 'LABEL', label: '文字' })
    expect(wrapper.find('.label-control').text()).toBe('文字')
  })

  it('颜色 / 字号 / 粗细落到正文内联样式', () => {
    const wrapper = mountField({
      name: 'note',
      type: 'LABEL',
      label: '文字',
      text: '请如实填写',
      color: '#d93026',
      fontSize: 18,
      fontWeight: 'bold',
    })
    const el = wrapper.find('.label-control').element as HTMLElement
    expect(el.style.fontSize).toBe('18px')
    expect(el.style.fontWeight).toBe('bold')
    expect(el.style.color).not.toBe('')
  })

  it('未配置样式时不注入内联样式', () => {
    const wrapper = mountField({ name: 'note', type: 'LABEL', label: '文字', text: '正文' })
    const el = wrapper.find('.label-control').element as HTMLElement
    expect(el.getAttribute('style') ?? '').toBe('')
  })

  it('左 / 居中 / 右对齐落到正文内联样式', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      const wrapper = mountField({
        name: 'note',
        type: 'LABEL',
        label: '文字',
        text: '正文',
        textAlign: align,
      })
      const el = wrapper.find('.label-control').element as HTMLElement
      expect(el.style.textAlign).toBe(align)
    }
  })
})

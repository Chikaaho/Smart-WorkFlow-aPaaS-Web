import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DesignerCanvas from './DesignerCanvas.vue'
import type { DesignerItem } from './types'
import type { FormSchemaField } from '@/contracts/form-schema'

/**
 * DesignerCanvas（WYSIWYG）测试：
 *  ① 每个字段渲染一个壳 + 类型徽标，真控件经 FormPreview(design) 渲染
 *  ② 每个 FormPreview 收到「单字段」schema 且 mode='design'
 *  ③ 点壳 = 选中（update:selectedId）
 *  ④ 删除 = 移除该字段（update:items）+ 清选中
 *  ⑤ REFERENCE 照传 FormPreview（降级由 adapter 负责）；TABLE 渲成占位块 + 「编辑子表」入口
 *  ⑥ 点 TABLE 编辑入口 emit editTable（已发布只读时不 emit）
 *  ⑦ 无字段时出空态提示
 *
 * FormPreview / VueDraggable 均 stub —— 画布只验壳层逻辑，不拉起 form-create 子 app / SortableJS。
 */

const FormPreviewStub = {
  props: ['schema', 'mode'],
  template:
    '<div data-testid="fc" :data-mode="mode" :data-fields="JSON.stringify(schema.fields)"></div>',
}
// 透传 default slot，绕过 SortableJS 的 jsdom 依赖。
const DraggableStub = { template: '<div><slot /></div>' }

const stubs = { FormPreview: FormPreviewStub, VueDraggable: DraggableStub }

function item(id: string, name: string, overrides: Partial<FormSchemaField> = {}): DesignerItem {
  return {
    id,
    field: {
      name,
      type: (overrides.type as FormSchemaField['type']) ?? 'TEXT',
      label: overrides.label,
      required: overrides.required ?? false,
      ...overrides,
    } as FormSchemaField,
  }
}

function mountCanvas(items: DesignerItem[], selectedId: string | null = null) {
  return mount(DesignerCanvas, {
    props: { items, selectedId },
    global: { stubs },
  })
}

describe('DesignerCanvas (WYSIWYG)', () => {
  it('renders one shell + type badge per item', () => {
    const wrapper = mountCanvas([
      item('di_1', 'username', { type: 'TEXT' }),
      item('di_2', 'age', { type: 'NUMBER' }),
    ])
    expect(wrapper.findAll('.field-shell')).toHaveLength(2)
    const badges = wrapper.findAll('.field-shell__type').map((b) => b.text())
    expect(badges).toEqual(['单行文本', '数字'])
  })

  it('feeds each FormPreview a single-field design schema', () => {
    const wrapper = mountCanvas([
      item('di_1', 'username', { type: 'TEXT', label: '用户名' }),
      item('di_2', 'age', { type: 'NUMBER' }),
    ])
    const previews = wrapper.findAll('[data-testid="fc"]')
    expect(previews).toHaveLength(2)
    for (const p of previews) {
      expect(p.attributes('data-mode')).toBe('design')
      const fields = JSON.parse(p.attributes('data-fields')!) as FormSchemaField[]
      expect(fields).toHaveLength(1)
    }
    const first = JSON.parse(previews[0].attributes('data-fields')!) as FormSchemaField[]
    expect(first[0]).toMatchObject({ name: 'username', type: 'TEXT', label: '用户名' })
  })

  it('selects field on shell click', async () => {
    const wrapper = mountCanvas([item('di_1', 'a'), item('di_2', 'b')])
    await wrapper.findAll('.field-shell')[1].trigger('click')
    expect(wrapper.emitted('update:selectedId')?.at(-1)).toEqual(['di_2'])
  })

  it('removes field on delete and clears selection when it was selected', async () => {
    const items = [item('di_1', 'a'), item('di_2', 'b')]
    const wrapper = mountCanvas(items, 'di_1')
    await wrapper.findAll('.field-shell__del')[0].trigger('click')

    const emittedItems = wrapper.emitted('update:items')?.at(-1)?.[0] as DesignerItem[]
    expect(emittedItems.map((it) => it.id)).toEqual(['di_2'])
    expect(wrapper.emitted('update:selectedId')?.at(-1)).toEqual([null])
  })

  it('passes REFERENCE through to FormPreview but renders TABLE as a placeholder block', () => {
    const wrapper = mountCanvas([
      item('di_1', 'ref', { type: 'REFERENCE', targetFormId: 'form_x' }),
      item('di_2', 'tbl', {
        type: 'TABLE',
        label: '明细',
        subFields: [
          { name: 'c1', type: 'TEXT' },
          { name: 'c2', type: 'NUMBER' },
        ],
      }),
    ])
    // REFERENCE 仍走 FormPreview（降级由 adapter 负责）；TABLE 不再走 FormPreview。
    const previews = wrapper.findAll('[data-testid="fc"]')
    expect(previews).toHaveLength(1)
    expect((JSON.parse(previews[0].attributes('data-fields')!) as FormSchemaField[])[0].type).toBe(
      'REFERENCE',
    )
    // TABLE 渲染成占位块：显示标签 + 「N 个子字段」 + 编辑入口。
    const table = wrapper.find('.field-shell__table')
    expect(table.exists()).toBe(true)
    expect(table.find('.field-shell__table-label').text()).toBe('明细')
    expect(table.find('.field-shell__table-count').text()).toBe('2 个子字段')
    expect(table.find('.field-shell__table-edit').exists()).toBe(true)
  })

  it('emits editTable with the field id when the TABLE edit entry is clicked', async () => {
    const wrapper = mountCanvas([item('di_9', 'tbl', { type: 'TABLE', subFields: [] })])
    await wrapper.find('.field-shell__table-edit').trigger('click')
    expect(wrapper.emitted('editTable')?.at(-1)).toEqual(['di_9'])
  })

  it('does not emit editTable when readonly (published form)', async () => {
    const wrapper = mount(DesignerCanvas, {
      props: {
        items: [item('di_9', 'tbl', { type: 'TABLE', subFields: [] })],
        selectedId: null,
        readonly: true,
      },
      global: { stubs },
    })
    await wrapper.find('.field-shell__table-edit').trigger('click')
    expect(wrapper.emitted('editTable')).toBeUndefined()
  })

  it('shows empty hint when no items', () => {
    const wrapper = mountCanvas([])
    expect(wrapper.find('.canvas__empty').exists()).toBe(true)
    expect(wrapper.findAll('.field-shell')).toHaveLength(0)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { exportFormTableExcel } = vi.hoisted(() => ({ exportFormTableExcel: vi.fn() }))
vi.mock('@/adapters/form-runtime', () => ({ exportFormTableExcel }))

import TableControl from './TableControl.vue'
// 子表单元格控件由注册表模块的副作用写入（MULTISELECT → MultiSelectControl）
import '@/components/dynamic-field-registry'

const FIELD = {
  name: 'items',
  type: 'TABLE',
  label: '采购明细',
  subFields: [{ name: 'product', type: 'TEXT', label: '产品名称' }],
} as const

const MULTI_FIELD = {
  name: 'items',
  type: 'TABLE',
  label: '采购明细',
  subFields: [
    { name: 'product', type: 'TEXT', label: '产品名称' },
    {
      name: 'tags',
      type: 'MULTISELECT',
      label: '标签',
      options: [
        { key: 'a', value: '蓝色' },
        { key: 'b', value: '绿色' },
        { key: 'c', value: '白色' },
      ],
    },
  ],
} as const

function control(props: Record<string, unknown> = {}) {
  return mount(TableControl, {
    props: {
      field: FIELD,
      modelValue: [{ product: '服务器' }],
      readonly: true,
      formKey: 'demo_form',
      recordId: 'rec-1',
      ...props,
    },
  })
}

describe('TableControl 明细表导出（F2-6）', () => {
  beforeEach(() => {
    exportFormTableExcel.mockReset()
    exportFormTableExcel.mockResolvedValue({ blob: new Blob(['x']), fileName: 'a.xlsx' })
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock')
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  it('只读详情中每张明细表显示导出按钮，携带表单/记录/字段名调用', async () => {
    const wrapper = control()
    const button = wrapper.findAll('button').find((item) => item.text() === '导出 Excel')
    expect(button).toBeTruthy()
    await button?.trigger('click')
    await flushPromises()
    expect(exportFormTableExcel).toHaveBeenCalledWith('demo_form', 'rec-1', 'items')
  })

  it('缺少记录上下文或编辑态不显示导出按钮', () => {
    expect(control({ recordId: '' }).text()).not.toContain('导出 Excel')
    expect(control({ readonly: false }).text()).not.toContain('导出 Excel')
  })

  it('U3 只读多选单元格按实际选中项回显（JSON 字符串归一为数组）', () => {
    const wrapper = mount(TableControl, {
      props: {
        field: MULTI_FIELD,
        modelValue: [{ product: '新版本部件-01', tags: '["a","b"]' }],
        readonly: true,
        formKey: 'demo_form',
        recordId: 'rec-1',
      },
    })
    const selected = wrapper
      .findAll('.readonly-option.is-selected')
      .map((item) => item.text().trim())
    expect(selected).toEqual(['✓ 蓝色', '✓ 绿色'])
    const unchecked = wrapper
      .findAll('.readonly-option')
      .filter((item) => !item.classes().includes('is-selected'))
      .map((item) => item.text().trim())
    expect(unchecked).toEqual(['白色'])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const { exportFormTableExcel } = vi.hoisted(() => ({ exportFormTableExcel: vi.fn() }))
vi.mock('@/adapters/form-runtime', () => ({ exportFormTableExcel }))

import TableControl from './TableControl.vue'

const FIELD = {
  name: 'items',
  type: 'TABLE',
  label: '采购明细',
  subFields: [{ name: 'product', type: 'TEXT', label: '产品名称' }],
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
})

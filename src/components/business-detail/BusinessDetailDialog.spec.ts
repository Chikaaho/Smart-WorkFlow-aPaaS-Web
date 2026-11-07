import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/adapters/form-runtime', () => ({
  getFormData: vi.fn(),
  getFormDefinition: vi.fn(),
  resolveReferenceDisplay: vi.fn(),
}))
vi.mock('@/adapters/instance-relation', () => ({
  getInstanceRelation: vi.fn(),
  acceptTaskAction: vi.fn(),
  createTaskApproval: vi.fn(),
  pollCommandStatus: vi.fn(),
}))
vi.mock('@/adapters/instance-flow', () => ({
  InstanceFlowPanel: { name: 'InstanceFlowPanel', template: '<div class="flow-panel-stub" />' },
}))

import BusinessDetailDialog from './BusinessDetailDialog.vue'
import { getFormData, getFormDefinition } from '@/adapters/form-runtime'
import { getInstanceRelation } from '@/adapters/instance-relation'

const schema = {
  title: '',
  fields: [
    { name: 'assessmentRationale', type: 'TEXT', label: '判定依据', colSpan: 24, required: true },
  ],
}

const stubs = {
  // 只渲染绑定值，隔离各类型控件的真实实现（本文件只验证记录来源与空态分支）
  DynamicField: {
    template: '<div class="df-stub">{{ modelValue }}</div>',
    props: ['field', 'modelValue', 'readonly'],
  },
  'el-dialog': {
    template: '<div v-if="modelValue" class="dlg"><slot/></div>',
    props: ['modelValue'],
  },
  'el-alert': { template: '<div class="alert-stub">{{ title }}</div>', props: ['title', 'type'] },
  'el-card': { template: '<div class="card-stub"><slot/></div>', props: ['shadow'] },
}

function mountDialog(extraProps: Record<string, unknown> = {}) {
  return mount(BusinessDetailDialog, {
    props: {
      modelValue: true,
      title: '详情',
      formKey: 'campus_gate_incident',
      recordId: 'agent-business-key',
      ...extraProps,
    },
    global: { stubs, directives: { loading: {} } },
  })
}

describe('BusinessDetailDialog.vue 程序化发起实例的表单数据回退', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getFormDefinition).mockResolvedValue(schema as never)
    vi.mocked(getFormData).mockRejectedValue(new Error('404 not found'))
    vi.mocked(getInstanceRelation).mockResolvedValue({
      relation: 'PARTICIPANT',
      instance: null,
      approvalHistory: [],
    } as never)
  })

  it('表单记录缺失且传入 fallbackRecord 时回退渲染 formData，不显示错误提示', async () => {
    const wrapper = mountDialog({
      fallbackRecord: { assessmentRationale: '知识库无匹配活动，按 P0 处置' },
    })
    await flushPromises()

    expect(vi.mocked(getFormData)).toHaveBeenCalledTimes(1)
    const text = wrapper.text()
    expect(text).not.toContain('表单数据暂时无法显示')
    expect(text).toContain('知识库无匹配活动，按 P0 处置')
  })

  it('无 fallbackRecord 时回退 relations 返回的 formData', async () => {
    vi.mocked(getInstanceRelation).mockResolvedValue({
      relation: 'PARTICIPANT',
      instance: null,
      approvalHistory: [],
      formData: { assessmentRationale: '来自实例变量的研判依据' },
    } as never)
    const wrapper = mountDialog()
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toContain('表单数据暂时无法显示')
    expect(text).toContain('来自实例变量的研判依据')
  })

  it('表单记录与回退数据都缺失时保持错误提示', async () => {
    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.text()).toContain('表单数据暂时无法显示')
  })

  it('空对象 fallbackRecord 视为无回退数据，不伪造空表单', async () => {
    const wrapper = mountDialog({ fallbackRecord: {} })
    await flushPromises()

    expect(wrapper.text()).toContain('表单数据暂时无法显示')
  })
})

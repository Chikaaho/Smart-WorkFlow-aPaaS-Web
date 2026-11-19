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
  // 打印动作与打印版面属于 F2 独立链路，本文件只验证记录来源与空态分支
  PrintActions: { name: 'PrintActions', template: '<span class="print-actions-stub" />' },
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

describe('BusinessDetailDialog.vue 流程信息区只按真实流程证据渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getFormDefinition).mockResolvedValue(schema as never)
    vi.mocked(getFormData).mockResolvedValue({ assessmentRationale: '纯表单记录' } as never)
  })

  it('纯表单只有 processDefinitionKey、无历史无实例时整块流程信息不渲染', async () => {
    vi.mocked(getInstanceRelation).mockResolvedValue({
      relation: 'PARTICIPANT',
      instance: null,
      approvalHistory: [],
    } as never)
    const wrapper = mountDialog({ processDefinitionKey: 'bpm_leave01' })
    await flushPromises()

    expect(wrapper.find('.flow-panel-stub').exists()).toBe(false)
  })

  it('有审批历史时渲染流程信息区', async () => {
    vi.mocked(getInstanceRelation).mockResolvedValue({
      relation: 'PARTICIPANT',
      instance: null,
      approvalHistory: [],
    } as never)
    const wrapper = mountDialog({
      processDefinitionKey: 'bpm_leave01',
      approvalHistory: [
        {
          taskId: 't-1',
          taskName: '审批',
          nodeKey: 'approve',
          assignee: '1',
          createTime: '2026-11-16 10:00:00',
          endTime: '2026-11-16 11:00:00',
          approvalResult: 'APPROVED',
        },
      ],
    })
    await flushPromises()

    expect(wrapper.find('.flow-panel-stub').exists()).toBe(true)
  })

  it('已关联到流程实例时渲染流程信息区', async () => {
    vi.mocked(getInstanceRelation).mockResolvedValue({
      relation: 'PARTICIPANT',
      instance: {
        id: 1,
        processInstanceId: 'pi-1',
        processDefKey: 'bpm_leave01',
        processName: '请假',
        theme: null,
        status: 'RUNNING',
        initiatorId: 1,
        initiatorName: '张三',
        createTime: '2026-11-16 09:00:00',
        currentNodes: ['审批'],
        currentNodeKeys: ['approve'],
      },
      approvalHistory: [],
    } as never)
    const wrapper = mountDialog()
    await flushPromises()

    expect(wrapper.find('.flow-panel-stub').exists()).toBe(true)
  })

  it('草稿预览（有流程定义 key、尚无实例）同样不渲染流程信息区', async () => {
    vi.mocked(getInstanceRelation).mockRejectedValue(new Error('草稿无实例'))
    const wrapper = mountDialog({ processDefinitionKey: 'leave_approval' })
    await flushPromises()

    expect(wrapper.find('.flow-panel-stub').exists()).toBe(false)
  })

  it('调用方显式传入实例标识时渲染流程信息区', async () => {
    vi.mocked(getInstanceRelation).mockResolvedValue({
      relation: 'PARTICIPANT',
      instance: null,
      approvalHistory: [],
    } as never)
    const wrapper = mountDialog({ processInstanceId: 'pi-9' })
    await flushPromises()

    expect(wrapper.find('.flow-panel-stub').exists()).toBe(true)
  })

  it('relations 声明 formHasProcess=true 时，即使尚无实例也渲染流程信息区', async () => {
    vi.mocked(getInstanceRelation).mockResolvedValue({
      relation: 'NONE',
      instance: null,
      approvalHistory: [],
      formHasProcess: true,
    } as never)
    const wrapper = mountDialog({ formKey: 'bpm_leave01', recordId: 'rec-1' })
    await flushPromises()

    expect(wrapper.find('.flow-panel-stub').exists()).toBe(true)
  })

  it('relations 声明 formHasProcess=false 时，纯数据表单即使带流程定义 key 也不渲染', async () => {
    vi.mocked(getInstanceRelation).mockResolvedValue({
      relation: 'PARTICIPANT',
      instance: null,
      approvalHistory: [],
      formHasProcess: false,
    } as never)
    const wrapper = mountDialog({ processDefinitionKey: 'bpm_leave01' })
    await flushPromises()

    expect(wrapper.find('.flow-panel-stub').exists()).toBe(false)
  })

  it('调用方已知并有流程时（草稿预览）渲染流程信息区，不等接口判定', async () => {
    vi.mocked(getInstanceRelation).mockRejectedValue(new Error('草稿无实例'))
    const wrapper = mountDialog({
      processDefinitionKey: 'leave_approval',
      formHasProcess: true,
    })
    await flushPromises()

    expect(wrapper.find('.flow-panel-stub').exists()).toBe(true)
  })
})

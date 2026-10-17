import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { i18n } from '@/locales'
import type { ApprovalHistoryItem } from '@/contracts/bpm'

const mockGetProcessDefDefinitionByKey = vi.fn()
vi.mock('@/modules/workflow/api', () => ({
  getProcessDefDefinitionByKey: (...args: unknown[]) => mockGetProcessDefDefinitionByKey(...args),
}))

import InstanceFlowPanel from './InstanceFlowPanel.vue'

const stubs = {
  ProcessGraphView: { props: ['graph', 'trace', 'height', 'fitMargins'], template: '<div />' },
  'el-card': { template: '<div class="el-card"><slot/><slot name="header"/></div>' },
  'el-table': { props: ['data'], template: '<div><slot/></div>' },
  'el-table-column': { template: '<div/>' },
  'el-alert': { props: ['title'], template: '<div class="el-alert">{{ title }}</div>' },
  'el-button': { template: '<button><slot/></button>' },
}

function history(overrides: Partial<ApprovalHistoryItem>[] = []): ApprovalHistoryItem[] {
  const base: ApprovalHistoryItem[] = [
    {
      taskId: 't1',
      taskName: '发起申请',
      assignee: '2',
      assigneeName: '张三',
      createTime: '2026-10-17T09:00:00',
      endTime: '2026-10-17T09:30:00',
      approvalResult: 'APPROVED',
      action: 'APPROVE',
      nodeKey: 'submit',
    },
    {
      taskId: 't2',
      taskName: '部门审批',
      assignee: '3',
      assigneeName: '李四',
      createTime: '2026-10-17T10:00:00',
      endTime: null,
      approvalResult: null,
      nodeKey: 'dept_approve',
    },
    {
      // 会签派发通知行：无结果但有完成时间——不进入审批详情列表
      taskId: 't3',
      taskName: '抄送派发',
      assignee: '4',
      assigneeName: '王五',
      createTime: '2026-10-17T10:05:00',
      endTime: '2026-10-17T10:05:01',
      approvalResult: null,
      nodeKey: 'cc',
    },
  ]
  return base.map((row, index) => ({ ...row, ...(overrides[index] ?? {}) }))
}

describe('InstanceFlowPanel（表单详情外挂流程信息唯一控制面）', () => {
  beforeEach(() => {
    mockGetProcessDefDefinitionByKey.mockReset()
  })

  it('流转记录四列由真实审批历史派生（时间/节点/操作人/事件）', () => {
    const wrapper = mount(InstanceFlowPanel, {
      props: { approvalHistory: history(), processDefinitionKey: 'leave' },
      global: { plugins: [i18n], stubs },
    })

    const vm = wrapper.vm as unknown as {
      flowRecordRows: { node: string; operator: string; event: string }[]
    }
    expect(vm.flowRecordRows).toHaveLength(3)
    expect(vm.flowRecordRows[1].node).toBe('部门审批')
    expect(vm.flowRecordRows[1].operator).toBe('李四')
    expect(vm.flowRecordRows[0].event).toContain('已同意')
  })

  it('审批详情列表排除会签派发通知行，仅保留审批人行', () => {
    const wrapper = mount(InstanceFlowPanel, {
      props: { approvalHistory: history(), processDefinitionKey: 'leave' },
      global: { plugins: [i18n], stubs },
    })

    const vm = wrapper.vm as unknown as { peopleRows: { taskId: string }[] }
    expect(vm.peopleRows.map((r) => r.taskId)).toEqual(['t1', 't2'])
  })

  it('切到流程图 tab 才懒加载定义，并按当前节点派生轨迹', async () => {
    mockGetProcessDefDefinitionByKey.mockResolvedValueOnce({
      processKey: 'leave',
      name: '请假流程',
      formKey: 'leave_form',
      version: 3,
      elements: [
        { id: 'start', type: 'START_EVENT' },
        { id: 'dept_approve', type: 'USER_TASK' },
      ],
      canvas: {},
    })

    const wrapper = mount(InstanceFlowPanel, {
      props: {
        approvalHistory: history(),
        processDefinitionKey: 'leave',
        currentNodeKey: 'dept_approve',
      },
      global: { plugins: [i18n], stubs },
    })

    expect(mockGetProcessDefDefinitionByKey).not.toHaveBeenCalled()
    const vm = wrapper.vm as unknown as {
      onTabChange: (tab: string) => void
      detailGraph: { name: string } | null
      detailTrace: { activeNodeIds: string[] } | null
    }
    vm.onTabChange('graph')
    await flushPromises()

    expect(mockGetProcessDefDefinitionByKey).toHaveBeenCalledWith('leave')
    expect(vm.detailGraph?.name).toBe('请假流程')
    expect(vm.detailTrace?.activeNodeIds).toContain('dept_approve')
  })

  it('缺少流程定义键时不发请求，如实提示流程图不可用', async () => {
    const wrapper = mount(InstanceFlowPanel, {
      props: { approvalHistory: history(), processDefinitionKey: null },
      global: { plugins: [i18n], stubs },
    })

    const vm = wrapper.vm as unknown as { onTabChange: (tab: string) => void; graphError: string }
    vm.onTabChange('graph')
    await flushPromises()

    expect(mockGetProcessDefDefinitionByKey).not.toHaveBeenCalled()
    expect(vm.graphError).toBe(i18n.global.t('taskDetailUi.graphUnavailable'))
  })
})

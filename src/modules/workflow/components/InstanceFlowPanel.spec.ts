import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { i18n } from '@/locales'
import type { ApprovalHistoryItem } from '@/contracts/bpm'

const mockGetProcessDefDefinitionByKey = vi.fn()
const mockDownloadOpinionAttachment = vi.fn()
vi.mock('@/modules/workflow/api', () => ({
  getProcessDefDefinitionByKey: (...args: unknown[]) => mockGetProcessDefDefinitionByKey(...args),
  downloadOpinionAttachment: (...args: unknown[]) => mockDownloadOpinionAttachment(...args),
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

describe('InstanceFlowPanel 会签聚合（设计 60:190）', () => {
  const signStubs = {
    ...stubs,
    'el-dialog': {
      props: ['modelValue'],
      template: '<div v-if="modelValue" class="el-dialog"><slot name="header"/><slot/></div>',
    },
    'el-tabs': { props: ['modelValue'], template: '<div><slot/></div>' },
    'el-tab-pane': { props: ['label', 'name'], template: '<div><slot/></div>' },
  }

  /** 会签组 node_sign 两人（一同意一待处理）+ 单人审批组 + 派发通知行。 */
  function signHistory(): ApprovalHistoryItem[] {
    return [
      {
        taskId: 's1',
        taskName: '总公司会签',
        assignee: '11',
        assigneeName: '李宁',
        assigneeDept: '总公司',
        createTime: '2026-10-17T10:00:00',
        endTime: '2026-10-17T10:30:00',
        approvalResult: 'APPROVED',
        action: 'APPROVE',
        opinionData: { comment: '同意' },
        nodeKey: 'node_sign',
      },
      {
        taskId: 's2',
        taskName: '总公司会签',
        assignee: '12',
        assigneeName: '王芳',
        assigneeDept: '分公司1',
        createTime: '2026-10-17T10:00:00',
        endTime: null,
        approvalResult: null,
        nodeKey: 'node_sign',
      },
      {
        taskId: 's3',
        taskName: '分管领导审批',
        assignee: '13',
        assigneeName: '张伟',
        createTime: '2026-10-17T09:00:00',
        endTime: '2026-10-17T09:30:00',
        approvalResult: 'APPROVED',
        action: 'APPROVE',
        nodeKey: 'node_leader',
      },
    ]
  }

  it('多人节点聚合为会签记录入口，统计同意/待处理；单人节点不聚合', () => {
    const wrapper = mount(InstanceFlowPanel, {
      props: { approvalHistory: signHistory(), processDefinitionKey: 'leave' },
      global: { plugins: [i18n], stubs: signStubs },
    })

    const vm = wrapper.vm as unknown as {
      signGroups: { key: string; approved: number; pending: number }[]
    }
    expect(vm.signGroups).toHaveLength(1)
    expect(vm.signGroups[0].key).toBe('node_sign')
    expect(vm.signGroups[0].approved).toBe(1)
    expect(vm.signGroups[0].pending).toBe(1)

    const entry = wrapper.find('[data-testid="sign-group"]')
    expect(entry.exists()).toBe(true)
    expect(entry.text()).toContain('会签记录 · 总公司会签')
    expect(entry.text()).toContain('1人已同意')
    expect(entry.text()).toContain('1人待处理')
    expect(entry.text()).toContain('查看全部会签记录')
  })

  it('点击入口打开会签记录弹窗，筛选已同意仅剩同意行', async () => {
    const wrapper = mount(InstanceFlowPanel, {
      props: { approvalHistory: signHistory(), processDefinitionKey: 'leave' },
      global: { plugins: [i18n], stubs: signStubs },
    })

    expect(wrapper.find('[data-testid="sign-records-dialog"]').exists()).toBe(false)
    await wrapper.find('[data-testid="sign-group"]').trigger('click')

    const vm = wrapper.vm as unknown as {
      signDialogVisible: boolean
      signFilter: string
      signDialogRows: ApprovalHistoryItem[]
    }
    expect(vm.signDialogVisible).toBe(true)
    expect(vm.signDialogRows).toHaveLength(2)
    expect(wrapper.find('[data-testid="sign-records-stats"]').text()).toContain('1人已同意')

    vm.signFilter = 'agreed'
    await flushPromises()
    expect(vm.signDialogRows.map((r) => r.taskId)).toEqual(['s1'])

    vm.signFilter = 'rejected'
    await flushPromises()
    expect(vm.signDialogRows).toHaveLength(0)
  })
})

describe('InstanceFlowPanel 意见附件受控查看（direction-ui-completion-020）', () => {
  it('结构化引用渲染下载入口；旧纯文本标记不可查看，不拼下载地址', async () => {
    const wrapper = mount(InstanceFlowPanel, {
      props: { approvalHistory: [], processDefinitionKey: 'leave' },
      global: { plugins: [i18n], stubs },
    })
    const vm = wrapper.vm as unknown as {
      opinionDetailRow: ApprovalHistoryItem | null
      opinionDetailVisible: boolean
    }
    vm.opinionDetailRow = {
      taskId: 's1',
      taskName: '部门审批',
      assignee: '3',
      createTime: '2026-10-17T10:00:00',
      endTime: '2026-10-17T10:10:00',
      approvalResult: 'APPROVED',
      action: 'APPROVE',
      actionRecordId: 77,
      opinionData: {
        comment: '同意',
        attachments: [{ storageKey: 'store/key-1', name: '方案.pdf' }],
        files: ['旧文件名.pdf'],
      },
    }
    vm.opinionDetailVisible = true
    await flushPromises()

    const downloadButtons = wrapper.findAll('.p53-opinion-attachment button')
    expect(downloadButtons).toHaveLength(1)
    expect(downloadButtons[0].text()).toContain('方案.pdf')

    const unavailable = wrapper.findAll('.p53-opinion-attachment__unavailable')
    expect(unavailable).toHaveLength(1)
    expect(unavailable[0].text()).toContain('旧文件名.pdf')
    expect(unavailable[0].text()).toContain('不可查看')

    await downloadButtons[0].trigger('click')
    await flushPromises()
    expect(mockDownloadOpinionAttachment).toHaveBeenCalledWith(77, 'store/key-1', '方案.pdf')
  })
})

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

  it('流转记录事件列展示结构化意见摘要（结论项 + 关键值，多行文本不挤占）', () => {
    const rows = history([
      {},
      {
        approvalResult: 'APPROVED',
        endTime: '2026-10-17T10:30:00',
        opinionFields: [
          {
            name: 'planReadiness',
            label: '方案完备性',
            type: 'RADIO',
            value: '完备',
            displayValue: '完备',
          },
          {
            name: 'fieldCommander',
            label: '现场总指挥',
            type: 'USER',
            value: '9',
            displayValue: '赵磊',
          },
          {
            name: 'rollbackNotes',
            label: '回退方案可行性说明',
            type: 'TEXTAREA',
            value: 'x',
            displayValue: '回退脚本已预演通过',
          },
        ],
      },
      {},
    ])
    const wrapper = mount(InstanceFlowPanel, {
      props: { approvalHistory: rows, processDefinitionKey: 'leave' },
      global: { plugins: [i18n], stubs },
    })

    const vm = wrapper.vm as unknown as { flowRecordRows: { event: string }[] }
    expect(vm.flowRecordRows[1].event).toBe('已同意 · 方案完备性：完备 · 现场总指挥：赵磊')
    expect(vm.flowRecordRows[1].event).not.toContain('回退脚本已预演通过')
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

  it('结构化意见已含数组字段时，不再按旧检查项区块重复渲染同一标签', async () => {
    const wrapper = mount(InstanceFlowPanel, {
      props: { approvalHistory: [], processDefinitionKey: 'leave' },
      global: { plugins: [i18n], stubs },
    })
    const vm = wrapper.vm as unknown as {
      opinionDetailRow: ApprovalHistoryItem | null
      opinionDetailVisible: boolean
    }
    vm.opinionDetailRow = {
      taskId: 's2',
      taskName: '技术委员会会签',
      assignee: '9',
      createTime: '2026-11-08T04:54:00',
      endTime: '2026-11-08T04:54:04',
      approvalResult: 'APPROVED',
      action: 'APPROVE',
      opinionData: { impactSystems: ['通信系统'] },
      opinionFields: [
        {
          name: 'impactSystems',
          label: '影响系统清单',
          type: 'CHECKBOX',
          value: ['通信系统'],
          displayValue: '通信系统',
        },
      ],
    }
    vm.opinionDetailVisible = true
    await flushPromises()

    expect(wrapper.findAll('.p53-opinion-checks')).toHaveLength(0)
    const labels = wrapper.findAll('.p53-opinion-grid label').map((node) => node.text())
    expect(labels.filter((label) => label === '影响系统清单')).toHaveLength(1)
    expect(wrapper.find('.p53-opinion-grid').text()).toContain('通信系统')
  })
})

describe('InstanceFlowPanel 意见摘要每段带标签（0.3.3 H6）', () => {
  /** 构造单行审批历史，事件列由该行的 opinionFields 派生。 */
  function eventOf(
    fields: ApprovalHistoryItem['opinionFields'],
    overrides: Partial<ApprovalHistoryItem> = {},
  ) {
    const wrapper = mount(InstanceFlowPanel, {
      props: {
        approvalHistory: history([
          {},
          {
            approvalResult: 'APPROVED',
            endTime: '2026-11-08T10:30:00',
            opinionFields: fields ?? [],
            ...overrides,
          },
          {},
        ]),
        processDefinitionKey: 'leave',
      },
      global: { plugins: [i18n], stubs },
    })
    return (
      wrapper.vm as unknown as {
        flowRecordRows: { event: string; eventTitle: string }[]
      }
    ).flowRecordRows[1]
  }

  it('单选、是/否、人员三类字段每段均为「标签：值」，首段不再裸值', () => {
    const row = eventOf([
      {
        name: 'planReadiness',
        label: '方案完备性',
        type: 'RADIO',
        value: '完备',
        displayValue: '完备',
      },
      {
        name: 'readyConfirm',
        label: '演练准备就绪',
        type: 'RADIO',
        value: '是',
        displayValue: '是',
      },
      {
        name: 'fieldCommander',
        label: '现场总指挥',
        type: 'USER',
        value: '9',
        displayValue: '赵磊',
      },
    ])
    expect(row.event).toBe('已同意 · 方案完备性：完备 · 演练准备就绪：是 · 现场总指挥：赵磊')
    expect(row.event).not.toMatch(/·\s·|^完备/)
  })

  it('多选、数值、日期三类字段带标签；数值单位自标签尾部提升', () => {
    const row = eventOf([
      {
        name: 'impactSystems',
        label: '影响系统清单',
        type: 'CHECKBOX',
        value: ['调度自动化', '通信系统'],
        displayValue: '调度自动化、通信系统',
      },
      {
        name: 'downtimeMinutes',
        label: '预计停机时长（分钟）',
        type: 'NUMBER',
        value: 300,
        displayValue: '300',
      },
      {
        name: 'plannedStart',
        label: '调整后的演练时间',
        type: 'DATETIME',
        value: '2026-11-10 23:30',
        displayValue: '2026-11-10 23:30',
      },
    ])
    expect(row.event).toBe(
      '已同意 · 影响系统清单：调度自动化、通信系统 · 预计停机时长：300 分钟 · 调整后的演练时间：2026-11-10 23:30',
    )
    expect(row.eventTitle).toBe(row.event.replace('已同意 · ', ''))
  })

  it('是/否布尔字段映射中文；标签无单位的数值只显示数值本身', () => {
    const row = eventOf([
      {
        name: 'readyConfirm',
        label: '演练准备就绪',
        type: 'BOOL',
        value: true,
        displayValue: 'true',
      },
      {
        name: 'measuredTemp',
        label: '现场实测温度（℃）',
        type: 'NUMBER',
        value: 84.2,
        displayValue: '84.2',
      },
      {
        name: 'windowMinutes',
        label: '维护窗口时长',
        type: 'NUMBER',
        value: 240,
        displayValue: '240',
      },
    ])
    expect(row.event).toBe('已同意 · 演练准备就绪：是 · 现场实测温度：84.2 ℃ · 维护窗口时长：240')
  })

  it('长文本截断省略且悬浮标题保留全文；其余字段在场时多行文本不进摘要', () => {
    const longText =
      '结档：校保卫处已签收上报并要求 24 小时内提交书面处置报告，值守班次交接单已增加时限核对项并通报处置进展，属地派出所未再接报相关警情，北门夜间安保值守延长至 24:00，同意结档归档。'
    const truncated = eventOf([
      {
        name: 'closingNote',
        label: '结档意见',
        type: 'TEXTAREA',
        value: longText,
        displayValue: longText,
      },
    ])
    expect(truncated.event.endsWith('…')).toBe(true)
    expect(truncated.event.length).toBeLessThan(longText.length)
    expect(truncated.eventTitle).toBe(`结档意见：${longText}`)

    const skipped = eventOf([
      {
        name: 'factResult',
        label: '事实核实结论',
        type: 'RADIO',
        value: '属实',
        displayValue: '属实',
      },
      {
        name: 'sceneDescription',
        label: '现场情况描述',
        type: 'TEXTAREA',
        value: longText,
        displayValue: longText,
      },
    ])
    expect(skipped.event).toBe('已同意 · 事实核实结论：属实')
    expect(skipped.eventTitle).toBe('事实核实结论：属实')
  })

  it('会签弹窗行内意见与流转记录同规则（标签：值摘要优先，旧备注回退）', () => {
    const wrapper = mount(InstanceFlowPanel, {
      props: {
        approvalHistory: history([
          {},
          {
            taskId: 'sign-1',
            taskName: '技术委员会会签',
            assignee: '9',
            assigneeName: '杨帆',
            approvalResult: 'APPROVED',
            endTime: '2026-11-08T10:30:00',
            opinionFormId: 'op_drill_tech',
            opinionFields: [
              {
                name: 'riskRating',
                label: '风险评级',
                type: 'RADIO',
                value: '中',
                displayValue: '中',
              },
              {
                name: 'impactSystems',
                label: '影响系统清单',
                type: 'CHECKBOX',
                value: ['通信系统'],
                displayValue: '通信系统',
              },
              {
                name: 'downtimeMinutes',
                label: '预计停机时长（分钟）',
                type: 'NUMBER',
                value: 240,
                displayValue: '240',
              },
            ],
          },
          {},
        ]),
        processDefinitionKey: 'leave',
      },
      global: { plugins: [i18n], stubs },
    })
    const vm = wrapper.vm as unknown as {
      signOpinionText: (row: ApprovalHistoryItem) => string
      signDialogRows: ApprovalHistoryItem[]
    }
    const row = { ...(wrapper.props('approvalHistory')[1] as ApprovalHistoryItem) }
    expect(vm.signOpinionText(row)).toBe(
      '风险评级：中 · 影响系统清单：通信系统 · 预计停机时长：240 分钟',
    )
    expect(vm.signOpinionText({ ...row, opinionFields: [] })).toBe('')
  })

  it('备注型意见（无意见表单字段）同样带「审批意见」标签，长备注截断且悬浮全文', () => {
    const remark = eventOf([], {
      opinionFormId: 'DEFAULT_REMARK',
      opinionData: { comment: '校保卫处已签收上报，要求 24 小时内提交书面处置报告，同意结档。' },
    })
    expect(remark.event).toBe(
      '已同意 · 审批意见：校保卫处已签收上报，要求 24 小时内提交书面处置报告，同意结档。',
    )

    const longComment = '保卫部确认：演练期间 A/B 机房出入登记与监控值守已安排双人双岗。'.repeat(3)
    const long = eventOf([], { opinionData: { comment: longComment } })
    expect(long.event.endsWith('…')).toBe(true)
    expect(long.eventTitle).toBe(`审批意见：${longComment}`)
  })

  it('会签弹窗：备注型意见显示「审批意见：备注」，不再只显示“自定义审批表单”', () => {
    const wrapper = mount(InstanceFlowPanel, {
      props: {
        approvalHistory: history([
          {},
          {
            taskId: 'bl-1',
            taskName: '参与部门分管领导并行审批',
            assignee: '9',
            assigneeName: '赵磊',
            approvalResult: 'APPROVED',
            endTime: '2026-11-08T13:23:41.991',
            opinionFormId: 'DEFAULT_REMARK',
            opinionData: { comment: '保卫部确认：消防通道保持畅通。' },
            opinionFields: [],
          },
          {},
        ]),
        processDefinitionKey: 'leave',
      },
      global: { plugins: [i18n], stubs },
    })
    const vm = wrapper.vm as unknown as {
      signOpinionText: (row: ApprovalHistoryItem) => string
    }
    const row = wrapper.props('approvalHistory')[1] as ApprovalHistoryItem
    expect(vm.signOpinionText(row)).toBe('审批意见：保卫部确认：消防通道保持畅通。')
  })
})

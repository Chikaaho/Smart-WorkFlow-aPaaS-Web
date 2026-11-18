/**
 * 工作流种子：待办/已办任务、流程定义、草稿、命令存储、实例与实例详情。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */

export const MOCK_TODO_TASKS: Array<{
  taskId: string
  processInstanceId: string
  processName: string
  formKey: string
  businessKey: string
  createTime: string
}> = [
  {
    taskId: 'mock-task-001',
    processInstanceId: 'mock-proc-001',
    processName: '请假审批流程',
    formKey: 'leave-request',
    businessKey: 'fd_001',
    createTime: '2026-07-10T09:15:00',
  },
  {
    taskId: 'mock-task-002',
    processInstanceId: 'mock-proc-002',
    processName: '采购审批流程',
    formKey: 'purchase-order',
    businessKey: 'fd_003',
    createTime: '2026-07-11T14:30:00',
  },
  {
    taskId: 'mock-task-003',
    processInstanceId: 'mock-proc-003',
    processName: '合同审批流程',
    formKey: 'contract-approval',
    businessKey: 'fd_005',
    createTime: '2026-07-12T10:00:00',
  },
  {
    taskId: 'mock-task-004',
    processInstanceId: 'mock-proc-004',
    processName: '费用报销流程',
    formKey: 'expense-report',
    businessKey: 'gen_001',
    createTime: '2026-07-13T08:45:00',
  },
  {
    taskId: 'mock-task-005',
    processInstanceId: 'mock-proc-005',
    processName: '请假审批流程',
    formKey: 'leave-request',
    businessKey: 'gen_002',
    createTime: '2026-07-14T11:20:00',
  },
]

export const MOCK_PROCESS_DEFS: Array<{
  id: number
  processKey: string
  name: string
  formKey: string
  defVersion: number
  status: 'DRAFT' | 'PUBLISHED'
  createTime: string
  updateTime: string
}> = [
  {
    id: 1,
    processKey: 'skeleton_approval',
    name: '单节点审批流程',
    formKey: 'it_application',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-05 10:00:00',
    updateTime: '2026-07-05 10:00:00',
  },
  {
    id: 2,
    processKey: 'leave_approval',
    name: '请假审批流程',
    formKey: 'leave-request',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-08 14:20:00',
    updateTime: '2026-07-09 09:10:00',
  },
  {
    id: 3,
    processKey: 'contract_approval',
    name: '合同审批流程',
    formKey: 'contract-approval',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-06 16:30:00',
    updateTime: '2026-07-10 11:00:00',
  },
  {
    id: 4,
    processKey: 'purchase_draft',
    name: '采购审批（草稿）',
    formKey: 'purchase-order',
    defVersion: 1,
    status: 'DRAFT',
    createTime: '2026-07-12 08:00:00',
    updateTime: '2026-07-12 08:00:00',
  },
  {
    id: 5,
    processKey: 'expense_approval',
    name: '费用报销流程',
    formKey: 'expense-report',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-09 13:45:00',
    updateTime: '2026-07-11 15:30:00',
  },
]

export const MOCK_PROCESSED_TASKS: Array<{
  taskId: string
  taskName: string
  processInstanceId: string
  processName: string | null
  formKey: string
  businessKey: string
  createTime: string
  endTime: string | null
}> = [
  {
    taskId: 'processed-001',
    taskName: '请假审批',
    processInstanceId: 'proc-001',
    processName: '请假审批流程',
    formKey: 'leave-request',
    businessKey: 'fd_010',
    createTime: '2026-07-10T08:00:00',
    endTime: '2026-07-10T15:30:00',
  },
  {
    taskId: 'processed-002',
    taskName: '报销审批',
    processInstanceId: 'proc-002',
    processName: '费用报销流程',
    formKey: 'expense-report',
    businessKey: 'fd_011',
    createTime: '2026-07-12T09:00:00',
    endTime: '2026-07-12T17:00:00',
  },
  {
    taskId: 'processed-003',
    taskName: '合同审批',
    processInstanceId: 'proc-003',
    processName: null,
    formKey: 'contract-approval',
    businessKey: 'fd_012',
    createTime: '2026-07-14T10:00:00',
    endTime: null,
  },
]

export const MOCK_MY_DRAFTS: Array<{
  id: number
  ownerId: string
  title: string | null
  formKey: string
  formVersion: string | null
  processDefKey: string | null
  payload: string
  status: 'EDITING' | 'SUBMITTING' | 'SUBMITTED' | 'FAILED'
  commandId: string | null
  submitSeq: number
  resultRecordId: string | null
  lastError: string | null
  createTime: string
  updateTime: string
}> = [
  {
    id: 1,
    ownerId: '1',
    title: '张三的请假申请',
    formKey: 'leave-request',
    formVersion: '3',
    processDefKey: 'leave_approval',
    payload: '{"applicant":"张三","leaveType":"annual","days":2}',
    status: 'EDITING',
    commandId: null,
    submitSeq: 0,
    resultRecordId: null,
    lastError: null,
    createTime: '2026-08-01T09:00:00',
    updateTime: '2026-08-01T09:00:00',
  },
  {
    id: 2,
    ownerId: '999',
    title: '他人草稿（403 语义验证）',
    formKey: 'contract-approval',
    formVersion: '1',
    processDefKey: null,
    payload: '{"contractNo":"CT-OTHER"}',
    status: 'EDITING',
    commandId: null,
    submitSeq: 0,
    resultRecordId: null,
    lastError: null,
    createTime: '2026-07-30T11:00:00',
    updateTime: '2026-07-30T11:00:00',
  },
  {
    id: 3,
    ownerId: '1',
    title: '历史失败的提交',
    formKey: 'contract-approval',
    formVersion: '1',
    processDefKey: 'contract_approval',
    payload: '{"contractNo":"CT-2026-088"}',
    status: 'FAILED',
    commandId: 'cmd-failed-001',
    submitSeq: 1,
    resultRecordId: null,
    lastError: '表单数据校验失败：contractNo 与流程绑定的必填字段不匹配',
    createTime: '2026-07-28T15:00:00',
    updateTime: '2026-07-28T15:02:00',
  },
]

export let myDraftNextId = 100

export function nextMyDraftId(): number {
  return myDraftNextId++
}

export const MOCK_MY_PROCESSED: Array<{
  taskId: string
  taskName: string
  processInstanceId: string
  processName: string | null
  formKey: string
  businessKey: string
  action: 'APPROVE' | 'REJECT' | 'RETURN' | null
  handleTime: string
  instanceStatus: 'RUNNING' | 'APPROVED' | 'REJECTED' | null
  source: 'ACTION' | 'HISTORY_COMPAT'
}> = [
  {
    taskId: 'my-processed-001',
    taskName: '部门经理审批',
    processInstanceId: 'proc-001',
    processName: '请假审批流程',
    formKey: 'leave-request',
    businessKey: 'rec-leave-001',
    action: 'APPROVE',
    handleTime: '2026-07-20T10:15:00',
    instanceStatus: 'RUNNING',
    source: 'ACTION',
  },
  {
    taskId: 'my-processed-002',
    taskName: '提交申请',
    processInstanceId: 'proc-002',
    processName: '单节点审批流程',
    formKey: 'it_application',
    businessKey: 'rec-it-002',
    action: 'APPROVE',
    handleTime: '2026-07-15T15:30:00',
    instanceStatus: 'APPROVED',
    source: 'HISTORY_COMPAT',
  },
  {
    taskId: 'my-processed-003',
    taskName: '部门经理审批',
    processInstanceId: 'proc-003',
    processName: '合同审批流程',
    formKey: 'contract-approval',
    businessKey: 'rec-contract-003',
    action: 'REJECT',
    handleTime: '2026-07-18T16:00:00',
    instanceStatus: 'REJECTED',
    source: 'ACTION',
  },
  {
    taskId: 'my-processed-004',
    taskName: 'HR 审批',
    processInstanceId: 'proc-004',
    processName: '请假审批流程',
    formKey: 'leave-request',
    businessKey: 'rec-leave-004',
    action: null,
    handleTime: '2026-07-22T09:00:00',
    instanceStatus: null,
    source: 'HISTORY_COMPAT',
  },
]

export interface MockWorkflowCommand {
  commandId: string
  commandType: string
  channel: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  result: Record<string, unknown> | null
  failureReason: string | null
  retryCount: number
  createTime: string
  finishedAt: string | null
  /** GET 查询计数：达到 pollToComplete 后转 COMPLETED（终态命令不再计数） */
  pollCount: number
  pollToComplete: number
}

export const MOCK_WORKFLOW_COMMANDS = new Map<string, MockWorkflowCommand>([
  [
    'cmd-failed-001',
    {
      commandId: 'cmd-failed-001',
      commandType: 'DRAFT_SUBMIT',
      channel: 'ASYNC',
      status: 'FAILED',
      result: null,
      failureReason: '表单数据校验失败：contractNo 与流程绑定的必填字段不匹配',
      retryCount: 0,
      createTime: '2026-07-28T15:01:00',
      finishedAt: '2026-07-28T15:02:00',
      pollCount: 0,
      pollToComplete: 0,
    },
  ],
])

export let commandNextSeq = 0

export function registerMockCommand(commandType: string): MockWorkflowCommand {
  commandNextSeq += 1
  const command: MockWorkflowCommand = {
    commandId: `cmd-${Date.now()}-${commandNextSeq}`,
    commandType,
    channel: 'ASYNC',
    status: 'PROCESSING',
    result: null,
    failureReason: null,
    retryCount: 0,
    createTime: new Date().toISOString().slice(0, 19),
    finishedAt: null,
    pollCount: 0,
    pollToComplete: 2,
  }
  MOCK_WORKFLOW_COMMANDS.set(command.commandId, command)
  return command
}

export const MOCK_INSTANCES: Array<{
  id: number
  processInstanceId: string
  processDefKey: string
  processName: string | null
  businessKey: string
  formKey: string
  initiatorId: number
  status: 'RUNNING' | 'APPROVED' | 'REJECTED'
  createTime: string
}> = [
  {
    id: 1,
    processInstanceId: 'proc-001',
    processDefKey: 'leave_approval',
    processName: '请假审批流程',
    businessKey: 'rec-leave-001',
    formKey: 'leave-request',
    initiatorId: 1,
    status: 'RUNNING',
    createTime: '2026-07-20T09:30:00',
  },
  {
    id: 2,
    processInstanceId: 'proc-002',
    processDefKey: 'skeleton_approval',
    processName: '单节点审批流程',
    businessKey: 'rec-it-002',
    formKey: 'it_application',
    initiatorId: 2,
    status: 'APPROVED',
    createTime: '2026-07-15T14:00:00',
  },
  {
    id: 3,
    processInstanceId: 'proc-003',
    processDefKey: 'contract_approval',
    processName: '合同审批流程',
    businessKey: 'rec-contract-003',
    formKey: 'contract-approval',
    initiatorId: 3,
    status: 'REJECTED',
    createTime: '2026-07-18T11:15:00',
  },
  {
    id: 4,
    processInstanceId: 'proc-004',
    processDefKey: 'leave_approval',
    processName: '请假审批流程',
    businessKey: 'rec-leave-004',
    formKey: 'leave-request',
    initiatorId: 1,
    status: 'RUNNING',
    createTime: '2026-07-22T08:45:00',
  },
  {
    id: 5,
    processInstanceId: 'proc-005',
    processDefKey: 'skeleton_approval',
    processName: '单节点审批流程',
    businessKey: 'rec-it-005',
    formKey: 'it_application',
    initiatorId: 4,
    status: 'APPROVED',
    createTime: '2026-07-10T16:30:00',
  },
  {
    id: 6,
    processInstanceId: 'proc-006',
    processDefKey: 'leave_approval',
    processName: '请假审批流程',
    businessKey: 'rec-leave-006',
    formKey: 'leave-request',
    initiatorId: 2,
    status: 'RUNNING',
    createTime: '2026-07-25T13:20:00',
  },
]

export const MOCK_INSTANCE_DETAILS: Record<
  string,
  {
    activeNodeIds: string[]
    flowTrace: Array<{
      activityId: string
      activityName: string | null
      activityType: string
      startTime: string | null
      endTime: string | null
      assignee: string | null
      taskId: string | null
    }>
  }
> = {
  'proc-001': {
    // RUNNING — 活跃节点：部门审批
    activeNodeIds: ['Activity_approve1'],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-20T09:30:00',
        endTime: '2026-07-20T09:30:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Flow_submit2approve',
        activityName: null,
        activityType: 'sequenceFlow',
        startTime: '2026-07-20T09:30:00',
        endTime: '2026-07-20T09:30:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-20T09:30:00',
        endTime: '2026-07-20T10:15:00',
        assignee: '1',
        taskId: 'task-submit-001',
      },
      {
        activityId: 'Flow_submit2approve1',
        activityName: null,
        activityType: 'sequenceFlow',
        startTime: '2026-07-20T10:15:00',
        endTime: '2026-07-20T10:15:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-20T10:15:00',
        endTime: null,
        assignee: '2',
        taskId: 'task-approve1-001',
      },
    ],
  },
  'proc-002': {
    // APPROVED — 已完成（无活跃节点）
    activeNodeIds: [],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-15T14:00:00',
        endTime: '2026-07-15T14:00:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-15T14:00:00',
        endTime: '2026-07-15T15:30:00',
        assignee: '2',
        taskId: 'task-submit-002',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-15T15:30:00',
        endTime: '2026-07-16T09:00:00',
        assignee: '3',
        taskId: 'task-approve1-002',
      },
      {
        activityId: 'EndEvent_1',
        activityName: '结束',
        activityType: 'endEvent',
        startTime: '2026-07-16T09:00:00',
        endTime: '2026-07-16T09:00:00',
        assignee: null,
        taskId: null,
      },
    ],
  },
  'proc-003': {
    // REJECTED — 已驳回（无活跃节点）
    activeNodeIds: [],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-18T11:15:00',
        endTime: '2026-07-18T11:15:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-18T11:15:00',
        endTime: '2026-07-18T14:00:00',
        assignee: '3',
        taskId: 'task-submit-003',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-18T14:00:00',
        endTime: '2026-07-18T16:00:00',
        assignee: '4',
        taskId: 'task-approve1-003',
      },
      {
        activityId: 'EndEvent_1',
        activityName: '结束',
        activityType: 'endEvent',
        startTime: '2026-07-18T16:00:00',
        endTime: '2026-07-18T16:00:00',
        assignee: null,
        taskId: null,
      },
    ],
  },
  'proc-004': {
    // RUNNING — 刚启动（仅提交节点完成，部门审批活跃）
    activeNodeIds: ['Activity_approve1'],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-22T08:45:00',
        endTime: '2026-07-22T08:45:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-22T08:45:00',
        endTime: '2026-07-22T09:00:00',
        assignee: '1',
        taskId: 'task-submit-004',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-22T09:00:00',
        endTime: null,
        assignee: '2',
        taskId: 'task-approve1-004',
      },
    ],
  },
  'proc-005': {
    // APPROVED
    activeNodeIds: [],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-10T16:30:00',
        endTime: '2026-07-10T16:30:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-10T16:30:00',
        endTime: '2026-07-10T17:45:00',
        assignee: '4',
        taskId: 'task-submit-005',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-10T17:45:00',
        endTime: '2026-07-11T10:00:00',
        assignee: '2',
        taskId: 'task-approve1-005',
      },
      {
        activityId: 'EndEvent_1',
        activityName: '结束',
        activityType: 'endEvent',
        startTime: '2026-07-11T10:00:00',
        endTime: '2026-07-11T10:00:00',
        assignee: null,
        taskId: null,
      },
    ],
  },
  'proc-006': {
    // RUNNING — 多活跃节点（并行网关后的两个审批）
    activeNodeIds: ['Activity_approve1', 'Activity_approve2'],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-25T13:20:00',
        endTime: '2026-07-25T13:20:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-25T13:20:00',
        endTime: '2026-07-25T14:00:00',
        assignee: '2',
        taskId: 'task-submit-006',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-25T14:00:00',
        endTime: null,
        assignee: '3',
        taskId: 'task-approve1-006',
      },
      {
        activityId: 'Activity_approve2',
        activityName: 'HR 审批',
        activityType: 'userTask',
        startTime: '2026-07-25T14:00:00',
        endTime: null,
        assignee: '4',
        taskId: 'task-approve2-006',
      },
    ],
  },
}

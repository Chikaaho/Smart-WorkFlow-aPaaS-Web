/**
 * 通知种子：消息、规则、渠道、订阅、模板、发送记录与尝试明细。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */

export const MOCK_NOTIFY_MESSAGES: Array<{
  id: number
  recipientId: number
  title: string
  content: string
  bizType: 'WF_TODO' | 'WF_APPROVED' | 'SYSTEM'
  bizId: string | null
  read: boolean
  createTime: string
  createBy: number | null
  updateTime: string
  updateBy: number | null
  tenantId: number
}> = [
  {
    id: 1,
    recipientId: 1,
    title: '新待办任务：请假申请审批',
    content: '张三提交了请假申请，等待您审批。请假日期：2026-07-10，共2天。',
    bizType: 'WF_TODO',
    bizId: 'mock-task-001',
    read: false,
    createTime: '2026-07-15T09:00:00',
    createBy: null,
    updateTime: '2026-07-15T09:00:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 2,
    recipientId: 1,
    title: '审批结果：采购订单已通过',
    content: '您提交的采购订单已通过审批，请查看详情。',
    bizType: 'WF_APPROVED',
    bizId: 'mock-task-002',
    read: false,
    createTime: '2026-07-14T16:30:00',
    createBy: null,
    updateTime: '2026-07-14T16:30:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 3,
    recipientId: 1,
    title: '新待办任务：合同审批流程',
    content: '李四提交了合同审批申请，请尽快处理。合同编号：CT-2026-0712。',
    bizType: 'WF_TODO',
    bizId: 'mock-task-003',
    read: false,
    createTime: '2026-07-14T10:15:00',
    createBy: null,
    updateTime: '2026-07-14T10:15:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 4,
    recipientId: 1,
    title: '会议通知：项目复盘会',
    content: '项目复盘会定于7月16日14:00在3楼会议室召开，请准时参加。',
    bizType: 'WF_TODO',
    bizId: null,
    read: true,
    createTime: '2026-07-13T08:00:00',
    createBy: null,
    updateTime: '2026-07-13T08:00:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 5,
    recipientId: 1,
    title: '审批结果：费用报销已驳回',
    content: '您提交的费用报销单因缺少发票附件被驳回，请补充后重新提交。',
    bizType: 'WF_APPROVED',
    bizId: 'mock-task-004',
    read: true,
    createTime: '2026-07-12T15:45:00',
    createBy: null,
    updateTime: '2026-07-12T15:45:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 6,
    recipientId: 1,
    title: '新待办任务：差旅报销审批',
    content: '王五提交了差旅报销申请，金额3,200元，请审批。',
    bizType: 'WF_TODO',
    bizId: 'mock-task-005',
    read: true,
    createTime: '2026-07-11T11:20:00',
    createBy: null,
    updateTime: '2026-07-11T11:20:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 7,
    recipientId: 1,
    title: '系统通知：密码即将过期',
    content: '您的登录密码将于7天后过期，请及时修改密码以保障账户安全。',
    bizType: 'WF_TODO',
    bizId: null,
    read: false,
    createTime: '2026-07-10T09:00:00',
    createBy: null,
    updateTime: '2026-07-10T09:00:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 8,
    recipientId: 1,
    title: '审批结果：请假申请已通过',
    content: '您提交的请假申请（2026-07-10）已通过审批，请合理安排工作。',
    bizType: 'WF_APPROVED',
    bizId: 'fd_001',
    read: true,
    createTime: '2026-07-10T08:30:00',
    createBy: null,
    updateTime: '2026-07-10T08:30:00',
    updateBy: null,
    tenantId: 1,
  },
]

export const MOCK_NOTIFY_RULES: Array<{
  id: number
  ruleCode: string
  name: string
  eventType: string
  channelPriority: string
  recipientRule: string
  requiredFlag: boolean
  failurePolicy: 'RETRY' | 'MANUAL'
  enabled: boolean
  remark: string | null
}> = [
  {
    id: 1,
    ruleCode: 'todo_created_default',
    name: '待办创建默认规则',
    eventType: 'TODO_CREATED',
    channelPriority: 'IN_APP',
    recipientRule: 'ASSIGNEE',
    requiredFlag: true,
    failurePolicy: 'RETRY',
    enabled: true,
    remark: null,
  },
  {
    id: 2,
    ruleCode: 'process_approved_default',
    name: '审批通过默认规则',
    eventType: 'PROCESS_APPROVED',
    channelPriority: 'IN_APP',
    recipientRule: 'INITIATOR',
    requiredFlag: true,
    failurePolicy: 'RETRY',
    enabled: true,
    remark: null,
  },
]

export const MOCK_NOTIFY_CHANNELS: Array<{
  channel: string
  systemConfigured: boolean
  tenantEnabled: boolean
  senderDisplay: string | null
  configSummary: string | null
}> = [
  {
    channel: 'IN_APP',
    systemConfigured: true,
    tenantEnabled: true,
    senderDisplay: null,
    configSummary: '本地收件箱',
  },
  {
    channel: 'SMS',
    systemConfigured: false,
    tenantEnabled: false,
    senderDisplay: null,
    configSummary: null,
  },
  {
    channel: 'EMAIL',
    systemConfigured: false,
    tenantEnabled: false,
    senderDisplay: null,
    configSummary: null,
  },
  {
    channel: 'FEISHU',
    systemConfigured: false,
    tenantEnabled: false,
    senderDisplay: null,
    configSummary: null,
  },
  {
    channel: 'DINGTALK',
    systemConfigured: false,
    tenantEnabled: false,
    senderDisplay: null,
    configSummary: null,
  },
  {
    channel: 'WECHAT_WORK',
    systemConfigured: false,
    tenantEnabled: false,
    senderDisplay: null,
    configSummary: null,
  },
]

export const MOCK_NOTIFY_SUBSCRIPTIONS: Array<{
  eventType: string
  channel: string
  enabled: boolean
}> = []

export const MOCK_NOTIFY_TEMPLATES: Array<{
  id: number
  templateCode: string
  name: string
  titleTemplate: string
  contentTemplate: string
  enabled: boolean
  remark: string | null
  createTime: string
  updateTime: string
}> = [
  {
    id: 1,
    templateCode: 'WF_TODO_NOTICE',
    name: '待办提醒模板',
    titleTemplate: '${userName} 的待办提醒',
    contentTemplate: '您好 ${userName}，您有一条新的待办任务「${taskName}」需要处理。',
    enabled: true,
    remark: '流程待办通用通知',
    createTime: '2026-08-25T10:00:00',
    updateTime: '2026-08-25T10:00:00',
  },
  {
    id: 2,
    templateCode: 'WF_APPROVED_NOTICE',
    name: '审批通过模板',
    titleTemplate: '您的申请已通过',
    contentTemplate: '您好 ${userName}，您于 ${submitTime} 提交的申请已审批通过。',
    enabled: true,
    remark: null,
    createTime: '2026-08-25T10:05:00',
    updateTime: '2026-08-25T10:05:00',
  },
  {
    id: 3,
    templateCode: 'DISABLED_SAMPLE',
    name: '停用示例模板',
    titleTemplate: '示例 ${n}',
    contentTemplate: '该模板处于停用状态，编号 ${n}。',
    enabled: false,
    remark: '演示停用态不可预览/发送',
    createTime: '2026-08-25T10:10:00',
    updateTime: '2026-08-25T10:10:00',
  },
]

export interface MockNotifyRecord {
  id: number
  recipientId: number
  title: string
  content: string
  bizType: string
  bizId: string | null
  read: boolean
  channel: string
  deliveryStatus: string
  externalMessageId: string | null
  failureReason: string | null
  idempotencyKey: string | null
  createTime: string
}

export const MOCK_NOTIFY_RECORDS: MockNotifyRecord[] = [
  {
    id: 1,
    recipientId: 1,
    title: '催办提醒',
    content: '您有待办任务被催办：实例 pi-1002',
    bizType: 'WF_TODO',
    bizId: 'pi-1002',
    read: false,
    channel: 'IN_APP',
    deliveryStatus: 'SUCCESS',
    externalMessageId: null,
    failureReason: null,
    idempotencyKey: null,
    createTime: '2026-09-07 09:00:00',
  },
  {
    id: 2,
    recipientId: 1,
    title: '短信下发',
    content: '审批超时提醒',
    bizType: 'SYSTEM',
    bizId: 'pi-1003',
    read: false,
    channel: 'SMS',
    deliveryStatus: 'FAILED',
    externalMessageId: null,
    failureReason: '未配置生产渠道适配器',
    idempotencyKey: null,
    createTime: '2026-09-07 09:30:00',
  },
]

export interface MockNotifyAttempt {
  id: number
  messageId: number
  attemptNo: number
  channel: string
  status: string
  failureReason: string | null
  externalMessageId: string | null
  createTime: string
}

export const MOCK_NOTIFY_ATTEMPTS: MockNotifyAttempt[] = [
  {
    id: 1,
    messageId: 2,
    attemptNo: 1,
    channel: 'SMS',
    status: 'FAILED',
    failureReason: '未配置生产渠道适配器',
    externalMessageId: null,
    createTime: '2026-09-07 09:30:00',
  },
]

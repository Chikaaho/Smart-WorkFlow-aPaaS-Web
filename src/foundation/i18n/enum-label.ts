import { i18n } from '@/locales'

/**
 * 枚举线值 → 权威文案键（P61 R2a）。
 *
 * 为什么需要这一层：
 *   - 直接渲染线值（`{{ row.status }}`）会让中文用户看到 `PUBLISHED` 这类后端枚举；
 *   - 各页面各自维护映射，会出现「同一个 PUBLISHED 在 A 页叫已发布、在 B 页叫发布完成」。
 * 因此把「同一状态在全局只有一个词」固定在唯一一张表里，页面只做查表。
 *
 * 表里存的是**键**而不是求值结果：模块加载期求值会把语言固化，之后切换语言不再生效。
 * 未登记的线值回落为线值本身，避免把内部键名泄漏到界面（宁可显示 PUBLISHED 也不显示 agent.xxx）。
 */
export const ENUM_LABEL_KEYS = {
  /** IoT 连接健康状态（后端 connectivity 探测结果）。 */
  IOT_HEALTH: {
    HEALTHY: 'iot.health',
    UNHEALTHY: 'iot.healthUnhealthy',
  },
  /** IoT 发布态：设备 / 脚本 / 规则 / Topic / 物模型共用同一套状态词。 */
  IOT_RELEASE_STATE: {
    DRAFT: 'common.statusDraft',
    PUBLISHED: 'common.statusPublished',
    DISABLED: 'common.statusDisabled',
    RETIRED: 'iot.statusRetired',
    ARCHIVED: 'iot.statusArchived',
  },
  /** IoT 设备连接状态（后端刷新得到的在线态）。 */
  IOT_DEVICE_ONLINE: {
    ONLINE: 'iot.online',
    OFFLINE: 'iot.offline',
  },
  /** IoT 异步任务状态：解析、指令下发、流程触发记录共用。 */
  IOT_TASK_STATE: {
    PENDING: 'common.statusPending',
    SUCCESS: 'common.resultSuccess',
    FAILED: 'common.resultFailed',
    TIMEOUT: 'notify.statusTimeout',
  },
  /** 通知投递状态。 */
  NOTIFY_DELIVERY: {
    PENDING: 'common.statusPending',
    SUCCESS: 'common.resultSuccess',
    FAILED: 'common.resultFailed',
    RESENDING: 'notify.statusResending',
    TIMEOUT: 'notify.statusTimeout',
  },
  /** 流程实例状态（与后端 ProcessInstance.status 对齐）。 */
  WORKFLOW_INSTANCE: {
    RUNNING: 'common.statusRunning',
    APPROVED: 'common.statusApproved',
    REJECTED: 'common.statusRejected',
    COMPLETED: 'common.statusCompleted',
    CANCELLED: 'workflow.runtimeStateCancelled',
    TERMINATED: 'common.statusTerminated',
    SUSPENDED: 'common.statusSuspended',
  },
  /** Agent 图节点类型。 */
  AGENT_NODE_TYPE: {
    START: 'agent.nodeStart',
    END: 'agent.nodeEnd',
    LLM: 'agent.nodeLlm',
    TOOL: 'agent.nodeTool',
    CONDITION: 'agent.nodeCondition',
    LOOP: 'agent.nodeLoop',
    FORK: 'agent.nodeFork',
    JOIN: 'agent.nodeJoin',
  },
  /** 流程定义节点类型（与后端 ProcessGraph element.type 对齐）。 */
  WORKFLOW_NODE_TYPE: {
    START: 'workflow.nodeTypeStart',
    END: 'workflow.nodeTypeEnd',
    // 复用既有的列标题键：同一句中文只应有一个键
    APPROVAL: 'workflow.approvalNode',
    CONSENSUS: 'workflow.nodeTypeConsensus',
    CONDITION: 'workflow.nodeTypeCondition',
    COPY: 'workflow.ccNode',
    NOTIFICATION: 'workflow.nodeTypeNotification',
    P57_VERIFY: 'workflow.nodeTypeVerify',
  },
  /** 交接批次结果。 */
  HANDOVER_RESULT: {
    SUCCESS: 'common.resultSuccess',
    FAILED: 'common.resultFailed',
    PARTIAL: 'workflow.handoverPartial',
    PARTIALLY_COMPLETED: 'workflow.handoverPartial',
  },
  /** Agent 会话状态。 */
  AGENT_CONVERSATION: {
    ACTIVE: 'common.statusInProgress',
  },
} as const

export type EnumDomain = keyof typeof ENUM_LABEL_KEYS

/**
 * 取枚举线值的展示文案。
 * 未登记线值回落为线值本身（不回落为键名），调用方无需再写 `?? '-'`。
 */
export function enumLabel(domain: EnumDomain, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const key = (ENUM_LABEL_KEYS[domain] as Record<string, string>)[String(value)]
  if (!key) return String(value)
  return i18n.global.t(key)
}

/**
 * BPM 节点能力契约。
 *
 * 这是流程设计器消费的稳定产品语义，不暴露 Flowable 或其他引擎对象。
 * 能力清单由后端统一注册结果提供；前端不得维护另一份节点目录。
 */

export type BpmNodeCategory = 'EVENT' | 'TASK' | 'GATEWAY' | 'OTHER'

export type ParticipantStrategy =
  | 'FIXED_USER'
  | 'ROLE'
  | 'DEPT_LEADER'
  | 'POST'
  | 'DEPT_POST'
  | 'EXPRESSION'
  | 'ADAPTER'

export interface ParticipantConfig {
  strategy: ParticipantStrategy
  value?: string | number | Array<string | number>
  adapterId?: string
}

export interface ApprovalOpinionConfig {
  formId?: string
  version?: string
  fields?: Array<{
    key: string
    label: string
    type: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'RADIO' | 'CHECKBOX' | 'SELECT' | 'DATETIME' | 'NOTE'
    required?: boolean
    options?: string[]
    min?: number
    max?: number
    maxLength?: number
    visibleWhen?: string
    initialExpression?: string
  }>
}

/** I3 统一动作契约（与后端 ApprovalAction 一枚举同语义）。 */
export type ApprovalActionKind =
  | 'APPROVE'
  | 'RETURN'
  | 'REJECT'
  | 'DISAPPROVE'
  | 'TRANSFER'
  | 'DELEGATE'
  | 'AUTHORIZE'
  | 'ADD_SIGN'
  | 'SUPPLEMENT_SIGN'
  | 'WITHDRAW'
  | 'COMMUNICATE'
  | 'DISCARD'

export interface ApprovalActionRequest {
  action: ApprovalActionKind
  returnTargetNodeId?: string
  opinionFormId?: string
  opinionFormVersion?: string
  comment?: string
  opinionData?: Record<string, unknown>
  /** I3：转入人/受托人/代理受托人目标。 */
  targetUserId?: number
  /** I3：加签/补签参与人。 */
  participants?: number[]
  /** I3：SERIAL / PARALLEL。 */
  mode?: 'SERIAL' | 'PARALLEL'
  /** I3：代理规则 ID 与范围。 */
  ruleId?: number
  scopeType?: 'GLOBAL' | 'PROCESS' | 'NODE' | 'BUSINESS'
  processDefKey?: string
  nodeKey?: string
  businessKey?: string
  startAt?: string
  endAt?: string
  /** I3：撤回/废弃理由。 */
  reason?: string
  /** I3：沟通接收人。 */
  receivers?: number[]
  /** I3：沟通内容/回复。 */
  message?: string
}

export interface BpmNodeTopology {
  minIncoming: number
  maxIncoming: number | null
  minOutgoing: number
  maxOutgoing: number | null
}

/** 配置字段的约束保持为产品语义，具体字段值仍由节点能力声明。 */
export interface BpmNodeConfigField {
  key: string
  label: string
  type: string
  required: boolean
  validation?: Record<string, unknown>
}

export interface BpmNodeSupports {
  design: boolean
  save: boolean
  publish: boolean
  run: boolean
}

export interface BpmNodeCapability {
  /** 与 graph element.type 相同的稳定节点类型标识。 */
  type: string
  /** 面向设计器的显示名称与说明。 */
  displayName: string
  description: string
  category: BpmNodeCategory
  /** 能力实现/契约版本，由后端统一注册结果声明。 */
  version: string
  topology: BpmNodeTopology
  configFields: BpmNodeConfigField[]
  supports: BpmNodeSupports
}

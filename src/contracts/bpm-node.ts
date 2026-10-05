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
  /** P63：表单字段参与人——运行期按所选表单字段取人/取部门。 */
  | 'FORM_FIELD'

/** 参与人策略全集（设计器策略下拉的权威顺序；来源仍以服务端 validation.strategies 优先）。 */
export const PARTICIPANT_STRATEGIES: readonly ParticipantStrategy[] = [
  'FIXED_USER',
  'ROLE',
  'DEPT_LEADER',
  'POST',
  'DEPT_POST',
  'EXPRESSION',
  'ADAPTER',
  'FORM_FIELD',
]

/** P63：FORM_FIELD 参与人来源的对象类型（USER=所选人员审批；DEPT=服务端解析部门唯一负责人）。 */
export type ParticipantFormFieldObjectType = 'USER' | 'DEPT'

/** P63：FORM_FIELD 参与人来源的取值范围（MAIN=主表字段；TABLE=表格字段）。 */
export type ParticipantFormFieldScope = 'MAIN' | 'TABLE'

/**
 * P63：FORM_FIELD 参与人来源 value 形状。
 * scope=MAIN 时只需 field；scope=TABLE 时 tableField+column 必填（与服务端口径一致）。
 */
export interface ParticipantFormFieldValue {
  objectType: ParticipantFormFieldObjectType
  scope: ParticipantFormFieldScope
  /** 主字段名（scope=TABLE 时为表格字段所属的主字段名）。 */
  field: string
  tableField?: string
  column?: string
}

export interface ParticipantConfig {
  strategy: ParticipantStrategy
  /** FORM_FIELD 策略的 value 为 ParticipantFormFieldValue 对象；其余策略为标量/标量数组。 */
  value?: string | number | Array<string | number> | ParticipantFormFieldValue
  adapterId?: string
}

/** P63：动态并行分支来源类型（FORM_FIELD=表单字段；VARIABLE=流程变量；FIXED=固定值）。 */
export type DynamicParallelSourceType = 'FORM_FIELD' | 'VARIABLE' | 'FIXED'

/** P63：动态并行完成模式（VETO 为新的一句话口径：任一否决即不通过）。 */
export type DynamicParallelMode = 'ALL' | 'ANY' | 'RATIO' | 'VETO'

/** P63：动态并行来源为空时的处置（BLOCK=阻断；PROCEED=放行）。 */
export type DynamicParallelEmptyStrategy = 'BLOCK' | 'PROCEED'

/** P63：动态并行来源含无效值时的处置（BLOCK=阻断；SKIP=跳过）。 */
export type DynamicParallelInvalidStrategy = 'BLOCK' | 'SKIP'

/** P63：动态并行分支来源（semanticVersion=2 时按对象身份分支：逐人/逐部门/逐行）。 */
export interface DynamicParallelSource {
  type: DynamicParallelSourceType
  value: string | number | Array<string | number>
  objectType?: ParticipantFormFieldObjectType
  scope?: ParticipantFormFieldScope
  tableField?: string
  column?: string
}

/**
 * P63：DYNAMIC_PARALLEL 节点 config。
 * semanticVersion=2 表示新语义（按对象分支：人员来源逐人分支、部门来源逐部门分支、
 * 表格列来源逐行取值可追溯）；缺省 = 旧语义（按负责人合并，行为不变）。
 */
export interface DynamicParallelConfig {
  source: DynamicParallelSource
  mode: DynamicParallelMode
  ratio?: number
  maxBranches?: number
  emptyStrategy: DynamicParallelEmptyStrategy
  invalidStrategy: DynamicParallelInvalidStrategy
  /** 新语义显式写入 2；旧语义不得写入该键（服务端按缺省走旧口径）。 */
  semanticVersion?: number
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
  /** I3：转入人/受托人/代理受托人目标；64 位用户 ID 以十进制字符串保持精度。 */
  targetUserId?: number | string
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

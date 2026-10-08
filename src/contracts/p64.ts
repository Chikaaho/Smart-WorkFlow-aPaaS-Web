/**
 * P64 高级流程编排阶段Ⅰ契约（数据到动作：节点业务表单 / BPM 变量 / Trigger 判断 / 配置化动作）。
 *
 * 与后端 `com.sw.ck.bpm.api.dto.ProcessVariableDef / TriggerConfig / ActionConfig` 对齐；
 * 手写契约（仓内惯例，不走 gen:api-types）。旧图缺省 variables/triggers = 能力未启用。
 */

/** BPM 变量值类型（与后端 VARIABLE_TYPES 一致）。 */
export type BpmVariableType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'USER'
  | 'DEPT'
  | 'USER_SET'
  | 'DEPT_SET'
  | 'ROWS'

/** BPM 变量来源。 */
export type BpmVariableSource = 'MAIN_FORM' | 'NODE_FORM' | 'SYSTEM'

/** 变量定义（文档级，发布时随图冻结）。 */
export interface BpmVariableDef {
  varId: string
  name: string
  type: BpmVariableType
  source: BpmVariableSource
  /** MAIN_FORM：主业务表单字段名；SYSTEM：白名单键。 */
  sourceField?: string
  /** NODE_FORM：来源节点 key。 */
  sourceNodeKey?: string
  /** NODE_FORM：节点表单字段名。 */
  sourceFormField?: string
  /** 轮次口径：CURRENT（阶段Ⅰ唯一取值）。 */
  roundRule?: string
  /** 聚合：NONE / UNION（集合必配）/ CONCAT（ROWS）。 */
  aggregation?: string
  /** true = 可空变量缺值返回 null；false = 缺值阻止触发。 */
  nullable?: boolean
}

/** 动作输入映射项：targetField ← sourceVarId / itemField / literal 三选一。 */
export interface TriggerActionMapping {
  targetField: string
  sourceVarId?: string
  itemField?: string
  literal?: unknown
}

/** 配置化动作（阶段Ⅰ仅独立关联流程发起）。 */
export interface TriggerAction {
  actionId: string
  name?: string
  type: 'START_SINGLE' | 'START_EACH' | 'START_GROUPED'
  /** 集合动作来源变量 varId。 */
  sourceVariable?: string
  /** 分组动作稳定分组身份（USER/DEPT 项默认按 id）。 */
  groupBy?: string
  targetProcessDefKey: string
  targetFormKey: string
  /** 单次派发上限（默认 50，硬上限 200）。 */
  maxDispatch?: number
  mapping: TriggerActionMapping[]
}

/** Trigger 结果分支：同类型同值精确匹配；同类型同值重复分支发布拒绝。 */
export interface TriggerBranch {
  branchId: string
  name?: string
  matchType: 'NUMBER' | 'STRING' | 'BOOLEAN'
  matchValue: string
  actions: TriggerAction[]
}

/** Trigger 判断配置（文档级，随版本冻结；脚本只判断不执行）。 */
export interface TriggerConfig {
  triggerId: string
  name?: string
  event: 'TASK_SUBMITTED' | 'NODE_ROUND_COMPLETED' | 'PROCESS_COMPLETED'
  /** TASK_SUBMITTED / NODE_ROUND_COMPLETED 必填源节点。 */
  nodeKey?: string
  /** 函数体脚本（顶层 return），经 流程变量取值(name) 读取授权变量。 */
  script: string
  /** 授权变量 varId 列表（未列入不进入快照）。 */
  variables: string[]
  branches: TriggerBranch[]
  unmatchedDisposition?: 'HALT' | 'IGNORE'
  errorDisposition?: 'HALT' | 'IGNORE'
}

/** 任务节点业务表单视图（GET /workflow/tasks/{id}/node-form）。 */
export interface TaskNodeFormView {
  bound: boolean
  formKey?: string
  formName?: string
  formVersion?: string | number
  /** 表单 definition（fields 用于渲染）。 */
  definition?: { title?: string; fields?: Array<Record<string, unknown>> } & Record<string, unknown>
  /** EMPTY / DRAFT / SUBMITTED。 */
  status?: string
  data?: Record<string, unknown>
  roundNo?: number
}

/** Trigger 执行记录（实例维度回查）。 */
export interface TriggerExecView {
  id: number
  processInstanceId: string
  triggerId: string
  eventType: string
  nodeKey?: string
  roundNo: number
  execKey: string
  /** MATCHED / UNMATCHED / FAILED。 */
  status: string
  resultType?: string
  resultValue?: string
  matchedBranchId?: string
  disposition?: string
  errorText?: string
  snapshot?: string
  durationMs?: number
  createTime?: string
}

/** 动作意图/目标关联（实例维度回查）。 */
export interface ActionRefView {
  id: number
  execId: number
  processInstanceId: string
  triggerId?: string
  actionId: string
  actionType: string
  itemKey: string
  itemSummary?: string
  commandKey: string
  commandId?: number
  targetDefKey: string
  targetFormKey?: string
  targetRecordId?: string
  targetInstanceId?: string
  /** INTENT_SUBMITTED / STARTED / FAILED。 */
  status: string
  errorText?: string
  createTime?: string
}

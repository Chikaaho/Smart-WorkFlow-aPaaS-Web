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

/** 子→父输出回写字段映射项（from = 子侧字段/列，to = 父侧字段/列）。 */
export interface WriteBackFieldMapping {
  fromField: string
  toField: string
}

/** 子流程输出回写配置（P64 阶段Ⅱ A06：稳定行身份 + 版本守卫 + 允许字段受控）。 */
export interface WriteBackConfig {
  /** 子流程结果节点 key（取该节点最新有效轮次最终提交）。 */
  resultNodeKey: string
  /** 行级回写：子结果表格字段名（每行携带稳定来源行身份）。 */
  tableField?: string
  /** 子结果表格中承载来源行 ID 的列名（tableField 配置时必填）。 */
  rowKeyField?: string
  /** 父表单承载来源行的 TABLE 字段名（tableField 配置时必填）。 */
  parentTableField?: string
  /** 行级回写列映射（允许字段受控，未列出的列不回写）。 */
  fields?: WriteBackFieldMapping[]
  /** 主记录回写字段映射。 */
  mainFields?: WriteBackFieldMapping[]
}

/** 配置化动作（CHILD = 主子流程：派发冻结 + 等待策略 + 输出回写；缺省 = 阶段Ⅰ独立关联流程）。 */
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
  /** 阶段Ⅱ：'CHILD' = 主子流程；缺省/INDEPENDENT = 独立关联流程（零行为变化）。 */
  orchestration?: 'INDEPENDENT' | 'CHILD'
  /** 等待策略：ALL/ANY/COUNT/NONE（仅 CHILD）。 */
  waitPolicy?: 'ALL' | 'ANY' | 'COUNT' | 'NONE'
  /** COUNT 策略正整数 K（K ≤ 本批实际子流程数）。 */
  waitCount?: number
  /** 子→父输出回写配置（仅 CHILD）。 */
  writeBack?: WriteBackConfig
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

/** 子流程批次项视图（实例维度回查，P64 阶段Ⅱ）。 */
export interface ChildItemView {
  id: number
  itemKey: string
  /** DISPATCHED / WRITTEN / CONFLICT / FAILED / LATE / REFUSED。 */
  status: string
  sourceRowId?: string
  sourceRowVersion?: number
  targetRecordId?: string
  targetInstanceId?: string
  writebackJson?: string
  writebackSource?: string
  errorText?: string
}

/** 子流程派发批次视图（含批次项与等待/回写结果）。 */
export interface ChildBatchView {
  id: number
  batchKey: string
  parentInstanceId: string
  triggerId: string
  actionId: string
  roundNo: number
  waitPolicy: 'ALL' | 'ANY' | 'COUNT' | 'NONE'
  waitCount?: number
  expectedCount: number
  settledCount?: number
  /** WAITING / SETTLED / BLOCKED / CANCELLED。 */
  status: string
  blockReason?: string
  settledAt?: string
  parentDepth: number
  items: ChildItemView[]
}

/** 岗位委托关系（P64 阶段Ⅱ A07 后台组织域配置）。 */
export interface PostDelegateRow {
  id: number | string
  sourcePostId: number | string
  targetPostId: number | string
  /** ORG / DEPT。 */
  scopeType: string
  /** 精确部门 ID（字符串形态，雪花 ID 超出 JS 安全整数范围）。 */
  deptId?: string
  /** ENABLED / DISABLED。 */
  status: string
  remark?: string
  createTime?: string
}

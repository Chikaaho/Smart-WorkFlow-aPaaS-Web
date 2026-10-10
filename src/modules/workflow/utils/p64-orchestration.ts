/**
 * P64 阶段Ⅰ纯函数：变量/触发器草稿构建与客户端校验（与后端 ProcessVariableValidator 口径一致，
 * 服务端仍是最终权威；此处只做发布前可纠正的 UX 提示）。
 */
import type {
  BpmVariableDef,
  BpmVariableSource,
  BpmVariableType,
  TriggerAction,
  TriggerBranch,
  TriggerConfig,
} from '@/contracts/p64'

export const BPM_VARIABLE_TYPES: BpmVariableType[] = [
  'NUMBER',
  'STRING',
  'BOOLEAN',
  'USER',
  'DEPT',
  'USER_SET',
  'DEPT_SET',
  'ROWS',
]

export const BPM_VARIABLE_SOURCES: BpmVariableSource[] = ['MAIN_FORM', 'NODE_FORM', 'SYSTEM']

export const BPM_AGGREGATIONS = ['NONE', 'UNION', 'CONCAT'] as const

export const BPM_TRIGGER_EVENTS = [
  'TASK_SUBMITTED',
  'NODE_ROUND_COMPLETED',
  'PROCESS_COMPLETED',
] as const

export const BPM_ACTION_TYPES = ['START_SINGLE', 'START_EACH', 'START_GROUPED'] as const

export const DEFAULT_MAX_DISPATCH = 50
export const HARD_MAX_DISPATCH = 200

/** 系统变量只读白名单（与后端 SYSTEM_FIELDS 一致；不接受客户端扩充）。 */
export const BPM_SYSTEM_FIELDS = [
  'processInstanceId',
  'processDefKey',
  'businessKey',
  'formKey',
  'initiatorId',
  'tenantId',
  'currentNodeKey',
  'roundNo',
] as const

/** 变量草稿（编辑表单形状）。 */
export interface VariableDraft {
  varId: string
  name: string
  type: BpmVariableType
  source: BpmVariableSource
  sourceField: string
  sourceNodeKey: string
  sourceFormField: string
  aggregation: string
  nullable: boolean
}

export function emptyVariableDraft(): VariableDraft {
  return {
    varId: '',
    name: '',
    type: 'STRING',
    source: 'MAIN_FORM',
    sourceField: '',
    sourceNodeKey: '',
    sourceFormField: '',
    aggregation: 'NONE',
    nullable: false,
  }
}

export function buildVariableDef(draft: VariableDraft): BpmVariableDef {
  // 集合类型语义上必须并集去重：聚合规则自动对齐 UNION（服务端发布校验仍为权威）
  const isSetType = draft.type === 'USER_SET' || draft.type === 'DEPT_SET'
  return {
    varId: draft.varId.trim(),
    name: draft.name.trim() || draft.varId.trim(),
    type: draft.type,
    source: draft.source,
    sourceField: draft.sourceField.trim() || undefined,
    sourceNodeKey: draft.source === 'NODE_FORM' ? draft.sourceNodeKey.trim() : undefined,
    sourceFormField: draft.source === 'NODE_FORM' ? draft.sourceFormField.trim() : undefined,
    roundRule: 'CURRENT',
    aggregation: isSetType ? 'UNION' : draft.aggregation,
    nullable: draft.nullable,
  }
}

export function toVariableDraft(def: BpmVariableDef): VariableDraft {
  return {
    varId: def.varId,
    name: def.name,
    type: def.type,
    source: def.source,
    sourceField: def.sourceField ?? '',
    sourceNodeKey: def.sourceNodeKey ?? '',
    sourceFormField: def.sourceFormField ?? '',
    aggregation: def.aggregation ?? 'NONE',
    nullable: Boolean(def.nullable),
  }
}

/** 变量编辑客户端校验（返回错误列表；空 = 通过）。 */
export function validateVariableDraft(draft: VariableDraft, existingVarIds: string[]): string[] {
  const errors: string[] = []
  const varId = draft.varId.trim()
  if (!varId) errors.push('变量引用 ID 不能为空')
  if (existingVarIds.includes(varId)) errors.push(`变量引用 ID 重复: ${varId}`)
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(varId)) {
    errors.push('变量引用 ID 只能包含字母/数字/下划线且以字母或下划线开头')
  }
  if (draft.source === 'MAIN_FORM' && !draft.sourceField.trim()) {
    errors.push('主表来源必须选择字段')
  }
  if (draft.source === 'NODE_FORM') {
    if (!draft.sourceNodeKey.trim()) errors.push('节点表单来源必须选择节点')
    if (!draft.sourceFormField.trim()) errors.push('节点表单来源必须选择字段')
  }
  if (draft.source === 'SYSTEM' && !draft.sourceField.trim()) {
    errors.push('系统变量必须选择白名单字段')
  }
  // 集合类型的 UNION 聚合由 buildVariableDef 自动对齐（服务端发布校验仍为权威）
  return errors
}

/** 主表字段类型 → 可声明变量类型（发布校验同口径，用于过滤可选类型）。 */
export function compatibleVariableTypes(
  formFieldType: string,
  multiple: boolean,
): BpmVariableType[] {
  const t = (formFieldType || '').toUpperCase()
  if (t === 'NUMBER') return ['NUMBER']
  if (t === 'BOOL') return ['BOOLEAN']
  if (t === 'USER') return multiple ? ['USER_SET'] : ['USER', 'USER_SET']
  if (t === 'DEPT') return multiple ? ['DEPT_SET'] : ['DEPT', 'DEPT_SET']
  if (t === 'TABLE') return ['ROWS']
  if (
    ['TEXT', 'RICH_TEXT', 'DATE', 'TIME', 'DICT', 'MULTISELECT', 'REFERENCE', 'LABEL'].includes(t)
  ) {
    return ['STRING']
  }
  return []
}

// ==================== 触发器 ====================

export interface TriggerActionDraft {
  actionId: string
  name: string
  type: TriggerAction['type']
  sourceVariable: string
  groupBy: string
  targetProcessDefKey: string
  targetFormKey: string
  maxDispatch: number
  mapping: TriggerActionMappingDraft[]
}

export interface TriggerActionMappingDraft {
  targetField: string
  sourceVarId: string
  itemField: string
  literal: string
}

export interface TriggerBranchDraft {
  branchId: string
  name: string
  matchType: TriggerBranch['matchType']
  matchValue: string
  actions: TriggerActionDraft[]
}

export interface TriggerDraft {
  triggerId: string
  name: string
  event: TriggerConfig['event']
  nodeKey: string
  script: string
  variables: string[]
  branches: TriggerBranchDraft[]
  unmatchedDisposition: 'HALT' | 'IGNORE'
  errorDisposition: 'HALT' | 'IGNORE'
}

export function emptyMappingDraft(): TriggerActionMappingDraft {
  return { targetField: '', sourceVarId: '', itemField: '', literal: '' }
}

export function emptyActionDraft(): TriggerActionDraft {
  return {
    actionId: '',
    name: '',
    type: 'START_SINGLE',
    sourceVariable: '',
    groupBy: '',
    targetProcessDefKey: '',
    targetFormKey: '',
    maxDispatch: DEFAULT_MAX_DISPATCH,
    mapping: [emptyMappingDraft()],
  }
}

export function emptyBranchDraft(): TriggerBranchDraft {
  return { branchId: '', name: '', matchType: 'STRING', matchValue: '', actions: [] }
}

export function emptyTriggerDraft(): TriggerDraft {
  return {
    triggerId: '',
    name: '',
    event: 'NODE_ROUND_COMPLETED',
    nodeKey: '',
    script:
      "const v = 流程变量取值('请替换为变量ID');\nif (v === 'PASS') {\n  return 1;\n}\nreturn null;",
    variables: [],
    branches: [],
    unmatchedDisposition: 'HALT',
    errorDisposition: 'HALT',
  }
}

function buildMapping(
  draft: TriggerActionMappingDraft,
): import('@/contracts/p64').TriggerActionMapping | null {
  const targetField = draft.targetField.trim()
  if (!targetField) return null
  const sourceVarId = draft.sourceVarId.trim()
  const itemField = draft.itemField.trim()
  const literal = draft.literal.trim()
  if (sourceVarId) return { targetField, sourceVarId }
  if (itemField) return { targetField, itemField }
  if (literal) {
    // 数字/布尔字面量按 JSON 解释，其余按字符串
    if (literal === 'true' || literal === 'false')
      return { targetField, literal: literal === 'true' }
    if (/^-?\d+(\.\d+)?$/.test(literal)) return { targetField, literal: Number(literal) }
    return { targetField, literal }
  }
  return null
}

export function buildActionConfig(draft: TriggerActionDraft): TriggerAction {
  return {
    actionId: draft.actionId.trim(),
    name: draft.name.trim() || draft.actionId.trim(),
    type: draft.type,
    sourceVariable: draft.type === 'START_SINGLE' ? undefined : draft.sourceVariable.trim(),
    groupBy: draft.type === 'START_GROUPED' ? draft.groupBy.trim() || 'id' : undefined,
    targetProcessDefKey: draft.targetProcessDefKey.trim(),
    targetFormKey: draft.targetFormKey.trim(),
    maxDispatch: draft.maxDispatch,
    mapping: draft.mapping.map(buildMapping).filter((m): m is NonNullable<typeof m> => m !== null),
  }
}

export function buildBranch(draft: TriggerBranchDraft): TriggerBranch {
  return {
    branchId: draft.branchId.trim(),
    name: draft.name.trim() || draft.branchId.trim(),
    matchType: draft.matchType,
    matchValue: draft.matchValue.trim(),
    actions: draft.actions.map(buildActionConfig),
  }
}

export function buildTriggerConfig(draft: TriggerDraft): TriggerConfig {
  return {
    triggerId: draft.triggerId.trim(),
    name: draft.name.trim() || draft.triggerId.trim(),
    event: draft.event,
    nodeKey: draft.event === 'PROCESS_COMPLETED' ? undefined : draft.nodeKey.trim(),
    script: draft.script,
    variables: draft.variables,
    branches: draft.branches.map(buildBranch),
    unmatchedDisposition: draft.unmatchedDisposition,
    errorDisposition: draft.errorDisposition,
  }
}

export function toTriggerDraft(config: TriggerConfig): TriggerDraft {
  return {
    triggerId: config.triggerId,
    name: config.name ?? config.triggerId,
    event: config.event,
    nodeKey: config.nodeKey ?? '',
    script: config.script,
    variables: [...(config.variables ?? [])],
    branches: (config.branches ?? []).map((branch) => ({
      branchId: branch.branchId,
      name: branch.name ?? branch.branchId,
      matchType: branch.matchType,
      matchValue: branch.matchValue,
      actions: (branch.actions ?? []).map((action) => ({
        actionId: action.actionId,
        name: action.name ?? action.actionId,
        type: action.type,
        sourceVariable: action.sourceVariable ?? '',
        groupBy: action.groupBy ?? '',
        targetProcessDefKey: action.targetProcessDefKey,
        targetFormKey: action.targetFormKey,
        maxDispatch: action.maxDispatch ?? DEFAULT_MAX_DISPATCH,
        mapping: (action.mapping ?? []).map((m) => ({
          targetField: m.targetField,
          sourceVarId: m.sourceVarId ?? '',
          itemField: m.itemField ?? '',
          literal: m.literal === undefined || m.literal === null ? '' : String(m.literal),
        })),
      })),
    })),
    unmatchedDisposition: config.unmatchedDisposition ?? 'HALT',
    errorDisposition: config.errorDisposition ?? 'HALT',
  }
}

/** 触发器草稿客户端校验（服务端仍是最终权威）。 */
export function validateTriggerDraft(
  draft: TriggerDraft,
  existingTriggerIds: string[],
  knownVarIds: string[],
  nodeKeys: string[],
): string[] {
  const errors: string[] = []
  const triggerId = draft.triggerId.trim()
  if (!triggerId) errors.push('触发器 ID 不能为空')
  if (existingTriggerIds.includes(triggerId)) errors.push(`触发器 ID 重复: ${triggerId}`)
  if (draft.event !== 'PROCESS_COMPLETED') {
    if (!draft.nodeKey.trim()) errors.push('该事件必须绑定源节点')
    else if (!nodeKeys.includes(draft.nodeKey.trim())) errors.push('源节点不存在')
  }
  if (!draft.script.trim()) errors.push('判断脚本为空')
  else if (!draft.script.includes('return')) errors.push('脚本体必须包含 return 语句')
  const unknownVars = draft.variables.filter((varId) => !knownVarIds.includes(varId))
  if (unknownVars.length > 0) errors.push(`授权了未定义变量: ${unknownVars.join(', ')}`)
  const branchIds: string[] = []
  const seenMatch = new Set<string>()
  for (const branch of draft.branches) {
    const branchId = branch.branchId.trim()
    if (!branchId) errors.push('分支缺少 ID')
    else if (branchIds.includes(branchId)) errors.push(`分支 ID 重复: ${branchId}`)
    else branchIds.push(branchId)
    if (!branch.matchValue.trim()) errors.push(`分支 ${branchId || '?'} 匹配值为空`)
    if (branch.matchType === 'NUMBER' && Number.isNaN(Number(branch.matchValue))) {
      errors.push(`分支 ${branchId || '?'} 匹配值不是数字`)
    }
    if (branch.matchType === 'BOOLEAN' && !['true', 'false'].includes(branch.matchValue.trim())) {
      errors.push(`分支 ${branchId || '?'} 布尔匹配值无效`)
    }
    const matchKey = `${branch.matchType}=${branch.matchValue.trim()}`
    if (seenMatch.has(matchKey)) errors.push(`存在同类型同值重复分支: ${matchKey}`)
    else seenMatch.add(matchKey)
    const actionIds: string[] = []
    for (const action of branch.actions) {
      const actionId = action.actionId.trim()
      if (!actionId) errors.push('动作缺少 ID')
      else if (actionIds.includes(actionId)) errors.push(`动作 ID 重复: ${actionId}`)
      else actionIds.push(actionId)
      if (action.type !== 'START_SINGLE' && !action.sourceVariable.trim()) {
        errors.push(`动作 ${actionId || '?'}: 集合动作必须选择来源变量`)
      }
      if (action.type === 'START_GROUPED' && !action.groupBy.trim()) {
        errors.push(`动作 ${actionId || '?'}: 分组动作必须配置分组身份`)
      }
      if (!action.targetFormKey.trim() || !action.targetProcessDefKey.trim()) {
        errors.push(`动作 ${actionId || '?'}: 必须选择目标流程与表单`)
      }
      if (action.maxDispatch < 1 || action.maxDispatch > HARD_MAX_DISPATCH) {
        errors.push(`动作 ${actionId || '?'}: 派发上限必须在 1—${HARD_MAX_DISPATCH} 内`)
      }
      for (const mapping of action.mapping) {
        if (
          mapping.targetField.trim() &&
          !mapping.sourceVarId.trim() &&
          !mapping.itemField.trim() &&
          !mapping.literal.trim()
        ) {
          errors.push(`动作 ${actionId || '?'}: 映射 ${mapping.targetField} 缺少来源`)
        }
      }
    }
  }
  return errors
}

/** 节点业务表单绑定 config（写入节点 config.nodeForm）。 */
export function buildNodeFormConfig(formKey: string): { formKey: string } {
  return { formKey }
}

/**
 * 动作意图恢复入口可见性（复审06/提示05 P1-08a-W）。
 * 与后端 retryActionRef 的持久状态门槛一致：FAILED（有界重试终态失败）、
 * INTENT_SUBMITTED（已受理未启动）、STARTING（FLOW_START 失败/过期窗口）是合法恢复窗口；
 * STARTED 及其余终态（已成功启动/已收敛）不可再触发恢复，后端按持久事实二次拒绝。
 */
export function canRetryActionRefStatus(status: string): boolean {
  return status === 'FAILED' || status === 'INTENT_SUBMITTED' || status === 'STARTING'
}

/** 子流程等待策略（P64 阶段Ⅱ A05）。 */
export const CHILD_WAIT_POLICIES = ['ALL', 'ANY', 'COUNT', 'NONE'] as const
export type ChildWaitPolicy = (typeof CHILD_WAIT_POLICIES)[number]

/**
 * CHILD 子流程动作配置校验（与后端 ProcessVariableValidator#validateChildAction 同口径）：
 * 等待策略枚举、COUNT 正整数 K（≤ 单次派发上限）、回写结构（行级回写三件套/字段映射非空）。
 *
 * @return 错误列表；空 = 形状合法
 */
export function validateChildActionDraft(action: {
  actionId?: string
  orchestration?: string
  waitPolicy?: string
  waitCount?: number
  maxDispatch?: number
  writeBack?: {
    resultNodeKey?: string
    tableField?: string
    rowKeyField?: string
    parentTableField?: string
    fields?: Array<{ fromField: string; toField: string }>
    mainFields?: Array<{ fromField: string; toField: string }>
  }
}): string[] {
  const errors: string[] = []
  if (action.orchestration !== 'CHILD') {
    return errors
  }
  const actionId = action.actionId || '?'
  const policy = (action.waitPolicy || 'ALL').toUpperCase()
  if (!CHILD_WAIT_POLICIES.includes(policy as ChildWaitPolicy)) {
    errors.push(
      '子流程动作 ' + actionId + ': 等待策略无效 ' + action.waitPolicy + '（ALL/ANY/COUNT/NONE）',
    )
    return errors
  }
  if (policy === 'COUNT') {
    const k = action.waitCount
    if (k === undefined || k < 1) {
      errors.push('子流程动作 ' + actionId + ': COUNT 策略必须配置正整数 K')
    } else if (action.maxDispatch !== undefined && k > action.maxDispatch) {
      errors.push('子流程动作 ' + actionId + ': K=' + k + ' 超过单次派发上限 ' + action.maxDispatch)
    }
  }
  const wb = action.writeBack
  if (!wb) {
    return errors
  }
  if (!wb.resultNodeKey || !wb.resultNodeKey.trim()) {
    errors.push('子流程动作 ' + actionId + ': 回写配置缺少 resultNodeKey')
    return errors
  }
  const hasRowWrite = !!(wb.tableField && wb.tableField.trim())
  if (hasRowWrite) {
    if (
      !wb.rowKeyField ||
      !wb.rowKeyField.trim() ||
      !wb.parentTableField ||
      !wb.parentTableField.trim()
    ) {
      errors.push('子流程动作 ' + actionId + ': 行级回写必须配置 rowKeyField 与 parentTableField')
      return errors
    }
    if (!wb.fields || wb.fields.length === 0) {
      errors.push('子流程动作 ' + actionId + ': 行级回写必须配置允许列映射 fields')
      return errors
    }
  }
  if ((!wb.fields || wb.fields.length === 0) && (!wb.mainFields || wb.mainFields.length === 0)) {
    errors.push('子流程动作 ' + actionId + ': 回写配置缺少任何字段映射')
  }
  return errors
}

/** 子流程批次项状态语义分组（回查展示用：等待中/成功/挂起/失败/留痕）。 */
export function childItemStatusKind(
  status: string,
): 'pending' | 'success' | 'suspended' | 'failed' | 'recorded' {
  switch (status) {
    case 'DISPATCHED':
      return 'pending'
    case 'WRITTEN':
      return 'success'
    case 'CONFLICT':
      return 'suspended'
    case 'FAILED':
    case 'REFUSED':
      return 'failed'
    default:
      return 'recorded'
  }
}

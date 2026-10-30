import type {
  FieldPermissionRule,
  FormSchema,
  FormSchemaField,
  TableSubField,
  VisibilityRule,
} from '@/contracts/form-schema'
import type { BpmVariableDef, TriggerConfig } from '@/contracts/p64'

export interface SnapshotFieldView {
  key: string
  path: string
  table: 'main' | 'subtable'
  parentLabel?: string
  field: FormSchemaField | TableSubField
  name: string
  label: string
  type: string
  required: boolean
  width?: number
  description?: string
}

export interface SnapshotConstraintView {
  path: string
  label: string
  kind: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'patternMessage'
  value: string
}

export interface SnapshotVisibilityView {
  target: string
  targetLabel: string
  logic: VisibilityRule['logic']
  conditions: Array<{ field: string; label: string; op: string; value?: string }>
}

export interface SnapshotColumnView {
  name: string
  label?: string
  width?: number
}

export interface SnapshotListConfigView {
  raw: unknown
  columns: SnapshotColumnView[]
  filters: Array<{ name: string; op: string }>
  defaultSort?: { name: string; desc: boolean }
  actions: string[]
}

export interface SnapshotFieldPermissionView {
  field: string
  label: string
  rule: FieldPermissionRule
}

export interface SnapshotProcessSource {
  defId: string
  defName: string
  processKey: string
  graphVersion: number
  versionName: string
  status: string
  formVersion?: string | null
  publishedAt?: string | null
  publisherName?: string | null
  graph: unknown
}

export interface SnapshotNodeView {
  processName: string
  processKey: string
  graphVersion: number
  id: string
  type: string
  name: string
  config: Record<string, unknown>
  listeners: Array<Record<string, unknown>>
}

export interface SnapshotVariableView {
  processName: string
  processKey: string
  graphVersion: number
  variable: BpmVariableDef
}

export interface SnapshotTriggerView {
  processName: string
  processKey: string
  graphVersion: number
  trigger: TriggerConfig
}

export type SnapshotScriptKind =
  | 'field'
  | 'formEvent'
  | 'nodeTrigger'
  | 'nodeConfig'
  | 'approverExpression'

export interface SnapshotScriptView {
  key: string
  kind: SnapshotScriptKind
  source: string
  label: string
  event?: string
  nodeKey?: string
  enabled?: boolean
  code: string
}

export interface SnapshotAdvancedConfigView {
  processName: string
  processKey: string
  graphVersion: number
  config: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function fieldLabelLookup(schema: FormSchema): Map<string, string> {
  const labels = new Map<string, string>()
  for (const field of schema.fields) {
    labels.set(field.name, field.label?.trim() || field.name)
    if (field.type !== 'TABLE') continue
    for (const sub of field.subFields) {
      labels.set(`${field.name}.${sub.name}`, sub.label?.trim() || `${field.name}.${sub.name}`)
    }
  }
  return labels
}

export function flattenSnapshotFields(schema: FormSchema): SnapshotFieldView[] {
  const rows: SnapshotFieldView[] = []
  for (const field of schema.fields) {
    rows.push({
      key: field.name,
      path: field.name,
      table: 'main',
      field,
      name: field.name,
      label: field.label?.trim() || field.name,
      type: field.type,
      required: field.required === true,
      width: field.colSpan,
      description: field.description,
    })
    if (field.type !== 'TABLE') continue
    for (const sub of field.subFields) {
      rows.push({
        key: `${field.name}.${sub.name}`,
        path: `${field.name}.${sub.name}`,
        table: 'subtable',
        parentLabel: field.label?.trim() || field.name,
        field: sub,
        name: sub.name,
        label: sub.label?.trim() || sub.name,
        type: sub.type,
        required: sub.required === true,
        description: sub.description,
      })
    }
  }
  return rows
}

export function buildSnapshotConstraints(fields: SnapshotFieldView[]): SnapshotConstraintView[] {
  const rows: SnapshotConstraintView[] = []
  for (const row of fields) {
    const field = row.field
    if (field.required) rows.push({ ...row, kind: 'required', value: 'true' })
    if (typeof field.minLength === 'number') {
      rows.push({ ...row, kind: 'minLength', value: String(field.minLength) })
    }
    if (typeof field.length === 'number') {
      rows.push({ ...row, kind: 'maxLength', value: String(field.length) })
    }
    if (field.pattern?.trim()) rows.push({ ...row, kind: 'pattern', value: field.pattern })
    if (field.patternMessage?.trim()) {
      rows.push({ ...row, kind: 'patternMessage', value: field.patternMessage })
    }
  }
  return rows
}

export function buildSnapshotVisibility(schema: FormSchema): SnapshotVisibilityView[] {
  const labels = fieldLabelLookup(schema)
  return (schema.rules?.visibility ?? []).map((rule) => ({
    target: rule.target,
    targetLabel: labels.get(rule.target) ?? rule.target,
    logic: rule.logic,
    conditions: rule.conditions.map((condition) => ({
      field: condition.field,
      label: labels.get(condition.field) ?? condition.field,
      op: condition.op,
      value: condition.value,
    })),
  }))
}

export function buildSnapshotFieldPermissions(schema: FormSchema): SnapshotFieldPermissionView[] {
  const labels = fieldLabelLookup(schema)
  return Object.entries(schema.fieldPermissions ?? {}).map(([field, rule]) => ({
    field,
    label: labels.get(field) ?? field,
    rule,
  }))
}

export function extractSnapshotListConfig(
  rawDefinition: Record<string, unknown>,
): SnapshotListConfigView | null {
  const keys = ['listConfig', 'list_config', 'listConfigJson', 'list_config_json'] as const
  const candidateKey = keys.find((key) => rawDefinition[key] != null)
  if (!candidateKey) return null
  const rawCandidate = rawDefinition[candidateKey]
  const config = parseObject(rawCandidate)
  if (!config) return null

  const columns = asArray(config.columns).flatMap((entry): SnapshotColumnView[] => {
    if (typeof entry === 'string' && entry.trim()) return [{ name: entry.trim() }]
    if (!isRecord(entry) || typeof entry.name !== 'string' || !entry.name.trim()) return []
    return [
      {
        name: entry.name.trim(),
        label: typeof entry.label === 'string' ? entry.label : undefined,
        width: typeof entry.width === 'number' ? entry.width : undefined,
      },
    ]
  })
  const filters = asArray(config.filters).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== 'string') return []
    return [{ name: entry.name, op: typeof entry.op === 'string' ? entry.op : '' }]
  })
  const sort = isRecord(config.defaultSort) ? config.defaultSort : null
  const defaultSort =
    sort && typeof sort.name === 'string'
      ? { name: sort.name, desc: sort.desc === true }
      : undefined
  const actions = asArray(config.actions).filter(
    (entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()),
  )
  return { raw: rawCandidate, columns, filters, defaultSort, actions }
}

export function buildSnapshotNodes(processes: SnapshotProcessSource[]): SnapshotNodeView[] {
  return processes.flatMap((process) => {
    const graph = parseObject(process.graph)
    const elements = asArray(graph?.elements)
    return elements.flatMap((entry): SnapshotNodeView[] => {
      if (!isRecord(entry) || entry.kind !== 'node' || typeof entry.id !== 'string') return []
      const config = isRecord(entry.config) ? entry.config : {}
      const listeners = asArray(config.listeners).filter(isRecord)
      return [
        {
          processName: process.defName,
          processKey: process.processKey,
          graphVersion: process.graphVersion,
          id: entry.id,
          type: text(entry.type, 'NODE'),
          name: text(config.name, text(config.nodeKey, entry.id)),
          config,
          listeners,
        },
      ]
    })
  })
}

export function buildSnapshotVariables(processes: SnapshotProcessSource[]): SnapshotVariableView[] {
  return processes.flatMap((process) => {
    const graph = parseObject(process.graph)
    return asArray(graph?.variables).flatMap((entry): SnapshotVariableView[] => {
      if (!isRecord(entry) || typeof entry.varId !== 'string') return []
      return [
        {
          processName: process.defName,
          processKey: process.processKey,
          graphVersion: process.graphVersion,
          variable: entry as unknown as BpmVariableDef,
        },
      ]
    })
  })
}

export function buildSnapshotTriggers(processes: SnapshotProcessSource[]): SnapshotTriggerView[] {
  return processes.flatMap((process) => {
    const graph = parseObject(process.graph)
    return asArray(graph?.triggers).flatMap((entry): SnapshotTriggerView[] => {
      if (!isRecord(entry) || typeof entry.triggerId !== 'string') return []
      return [
        {
          processName: process.defName,
          processKey: process.processKey,
          graphVersion: process.graphVersion,
          trigger: entry as unknown as TriggerConfig,
        },
      ]
    })
  })
}

export function buildSnapshotAdvancedConfigs(
  processes: SnapshotProcessSource[],
): SnapshotAdvancedConfigView[] {
  return processes.flatMap((process): SnapshotAdvancedConfigView[] => {
    const graph = parseObject(process.graph)
    const config = isRecord(graph?.advancedConfig) ? graph.advancedConfig : null
    if (!config) return []
    return [
      {
        processName: process.defName,
        processKey: process.processKey,
        graphVersion: process.graphVersion,
        config,
      },
    ]
  })
}

function nodeInlineScripts(
  process: SnapshotProcessSource,
  node: SnapshotNodeView,
): SnapshotScriptView[] {
  const rows: SnapshotScriptView[] = []
  for (const [key, value] of Object.entries(node.config)) {
    if (typeof value !== 'string' || !value.trim()) continue
    if (!/(script|expression)$/i.test(key)) continue
    // 通用脚本清单只按配置键收集；是否为审批人来源由参与人策略元数据判定，
    // 不按键名（如 participantScript/approverExpression）猜类型。
    rows.push({
      key: `${process.defId}:${process.graphVersion}:${node.id}:${key}`,
      kind: 'nodeConfig',
      source: `${process.defName} · v${process.graphVersion}`,
      label: `${node.name} · ${key}`,
      nodeKey: node.id,
      code: value,
    })
  }

  const approvalScript = approvalParticipantScript(node)
  if (approvalScript) {
    rows.push({
      key: `${process.defId}:${process.graphVersion}:${node.id}:approver-expression`,
      kind: 'approverExpression',
      source: `${process.defName} · v${process.graphVersion}`,
      label: node.name,
      nodeKey: node.id,
      code: approvalScript,
    })
  }

  node.listeners.forEach((listener, listenerIndex) => {
    for (const [key, value] of Object.entries(listener)) {
      if (typeof value !== 'string' || !value.trim()) continue
      if (!/(script|expression)$/i.test(key)) continue
      rows.push({
        key: `${process.defId}:${process.graphVersion}:${node.id}:listener:${listenerIndex}:${key}`,
        kind: 'nodeConfig',
        source: `${process.defName} · v${process.graphVersion}`,
        label: `${node.name} · ${text(listener.label, `listener ${listenerIndex + 1}`)} · ${key}`,
        nodeKey: node.id,
        code: value,
      })
    }
  })
  return rows
}

export function buildSnapshotScripts(
  schema: FormSchema,
  processes: SnapshotProcessSource[],
): SnapshotScriptView[] {
  const rows: SnapshotScriptView[] = []
  for (const field of schema.fields) {
    const code = field.script?.code?.trim()
    if (!code) continue
    rows.push({
      key: `field:${field.name}`,
      kind: 'field',
      source: 'FORM_FIELD',
      label: field.label?.trim() || field.name,
      code,
    })
  }

  for (const [event, actions] of Object.entries(schema.events ?? {})) {
    for (const action of actions ?? []) {
      if (!action.script?.trim()) continue
      rows.push({
        key: `form-event:${event}:${action.id}`,
        kind: 'formEvent',
        source: 'FORM_EVENT',
        label: action.name || action.id,
        event,
        enabled: action.enabled,
        code: action.script,
      })
    }
  }

  for (const process of processes) {
    for (const node of buildSnapshotNodes([process])) {
      rows.push(...nodeInlineScripts(process, node))
    }
  }

  for (const item of buildSnapshotTriggers(processes)) {
    if (!item.trigger.script?.trim()) continue
    rows.push({
      key: `trigger:${item.processKey}:${item.graphVersion}:${item.trigger.triggerId}`,
      kind: 'nodeTrigger',
      source: `${item.processName} · v${item.graphVersion}`,
      label: item.trigger.name || item.trigger.triggerId,
      event: item.trigger.event,
      nodeKey: item.trigger.nodeKey,
      enabled: item.trigger.enabled !== false,
      code: item.trigger.script,
    })
  }
  return dedupeScripts(rows)
}

/**
 * 审批人来源脚本的真实判据（冻结 JSON 元数据）：
 * 节点类型属于审批/会签人工节点，且 participant|approver 的 strategy|type 为 EXPRESSION，
 * value 为非空表达式文本。监听器与节点/流程触发器属于「监听」分类，不得混入本区。
 */
function approvalParticipantScript(node: SnapshotNodeView): string {
  const nodeType = node.type.trim().toUpperCase()
  if (nodeType !== 'APPROVAL' && nodeType !== 'CONSENSUS') return ''
  const participant = parseObject(node.config.participant) ?? parseObject(node.config.approver)
  const strategy = text(participant?.strategy ?? participant?.type)
    .trim()
    .toUpperCase()
  if (strategy !== 'EXPRESSION') return ''
  const expression = participant?.value
  return typeof expression === 'string' && expression.trim() ? expression : ''
}

export function buildSnapshotApprovalScripts(
  processes: SnapshotProcessSource[],
): SnapshotScriptView[] {
  // 只保留参与人元数据判定出的审批人来源脚本；节点/流程触发器与监听器不在本分类。
  return buildSnapshotScripts({ title: '', fields: [] }, processes).filter(
    (row) => row.kind === 'approverExpression',
  )
}

export function matchesSnapshotFormVersion(
  snapshotFormVersion: number,
  snapshotVersionLabel: string | null | undefined,
  processFormVersion: string | null | undefined,
): boolean {
  if (!processFormVersion?.trim()) return false
  const candidate = normalizeVersion(processFormVersion)
  return [String(snapshotFormVersion), snapshotVersionLabel ?? '']
    .filter(Boolean)
    .some((version) => normalizeVersion(version) === candidate)
}

function normalizeVersion(value: string): string {
  return value.trim().toLowerCase().replace(/^v/, '')
}

function dedupeScripts(rows: SnapshotScriptView[]): SnapshotScriptView[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.kind}|${row.source}|${row.label}|${row.event ?? ''}|${row.code}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/* ── 冻结节点配置只读投影（Q31/Q25/Q26/Q20）──
 * 只读取冻结版本里的节点 config 与流程 triggers，不补演示值、不把全局监听当作节点钩子。
 * 空值统一返回空结果，由查看层显示「未配置」。 */

export interface SnapshotParticipantView {
  /** 参与人策略原值（FIXED_USER/EXPRESSION 等），未声明时为空串。 */
  strategy: string
  /** 真实参与人值（标量/数组/表单字段对象/节点聚合对象）。 */
  value: unknown
  adapterId: string
}

export interface SnapshotOpinionFormView {
  formId: string
  version: string
  fields: Array<{ key: string; label: string; type: string; required: boolean }>
}

export interface SnapshotNodeFormView {
  formKey: string
  formVersion: string
}

export interface SnapshotNodeFieldStateView {
  field: string
  required: boolean
  editable: boolean
  hidden: boolean
}

export interface SnapshotNodeFieldPermissionView {
  field: string
  view: string[]
  edit: string[]
}

export interface SnapshotNodeScriptEntry {
  key: string
  code: string
}

export interface SnapshotNodeTriggerBinding {
  triggerId: string
  name: string
  event: string
  script: string
}

export interface SnapshotNodeOperationView {
  allowedActions: string[]
  returnTargets: string[]
}

export interface SnapshotNodeAdvancedEntry {
  key: string
  value: unknown
}

function stringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item) : ''))
    .filter((item) => item.trim() !== '')
}

/** 参与人来源：participant 优先，旧数据回退 approver；只按真实字段读取。 */
export function snapshotParticipantOf(
  config: Record<string, unknown>,
): SnapshotParticipantView | null {
  const raw = parseObject(config.participant) ?? parseObject(config.approver)
  if (!raw) {
    const legacy = config.participant ?? config.approver
    if (typeof legacy === 'string' && legacy.trim()) {
      return { strategy: '', value: legacy, adapterId: '' }
    }
    return null
  }
  const strategy = text(raw.strategy ?? raw.type)
    .trim()
    .toUpperCase()
  const adapterId = text(raw.adapterId)
  const value = raw.value ?? raw.values ?? raw.adapterId
  return { strategy, value, adapterId }
}

/** 节点条件：只认冻结 config 里的真实条件键，任一非空即原样可读。 */
export function snapshotNodeConditionText(config: Record<string, unknown>): string {
  for (const key of ['condition', 'conditionExpression', 'expression', 'expr', 'conditionScript']) {
    const value = config[key]
    if (value == null) continue
    const rendered = snapshotValueText(value)
    if (rendered) return rendered
  }
  return ''
}

/** 冻结值 → 可读文本；对象保持真实键值，不替换成占位说明。 */
export function snapshotValueText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => snapshotValueText(item))
      .filter((item) => item !== '')
      .join('、')
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, item]) => item != null && item !== '')
    if (entries.length === 0) return ''
    if (entries.length <= 6) {
      return entries.map(([key, item]) => `${key}=${snapshotValueText(item)}`).join(' · ')
    }
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value)
}

export function snapshotOpinionFormOf(
  config: Record<string, unknown>,
): SnapshotOpinionFormView | null {
  const raw = parseObject(config.opinionForm)
  if (!raw) return null
  const fields = asArray(raw.fields).flatMap((entry) => {
    if (!isRecord(entry)) return []
    const key = text(entry.key).trim()
    if (!key) return []
    return [
      {
        key,
        label: text(entry.label).trim() || key,
        type: text(entry.type),
        required: entry.required === true,
      },
    ]
  })
  return {
    formId: snapshotValueText(raw.formId),
    version: snapshotValueText(raw.version),
    fields,
  }
}

export function snapshotNodeFormOf(config: Record<string, unknown>): SnapshotNodeFormView | null {
  const raw = parseObject(config.nodeForm)
  if (!raw) return null
  const formKey = snapshotValueText(raw.formKey)
  if (!formKey) return null
  return { formKey, formVersion: snapshotValueText(raw.formVersion) }
}

/** 节点字段权限：fieldStates=每字段必填/编辑/隐藏三态，fieldPermissions=查看/编辑主体。 */
export function snapshotNodeFieldStates(
  config: Record<string, unknown>,
): SnapshotNodeFieldStateView[] {
  const raw = parseObject(config.fieldStates)
  if (!raw) return []
  return Object.entries(raw).flatMap(([field, value]) => {
    const state = parseObject(value)
    if (!state) return []
    return [
      {
        field,
        required: state.required === true,
        editable: state.editable === true,
        hidden: state.hidden === true,
      },
    ]
  })
}

export function snapshotNodeFieldPermissions(
  config: Record<string, unknown>,
): SnapshotNodeFieldPermissionView[] {
  const raw = parseObject(config.fieldPermissions)
  if (!raw) return []
  return Object.entries(raw).flatMap(([field, value]) => {
    const rule = parseObject(value)
    if (!rule) return []
    return [{ field, view: stringArray(rule.view), edit: stringArray(rule.edit) }]
  })
}

/** 节点内联脚本：config 里以 script/expression 结尾的真实文本，含 listeners 条目。 */
export function snapshotNodeInlineScripts(
  config: Record<string, unknown>,
): SnapshotNodeScriptEntry[] {
  const rows: SnapshotNodeScriptEntry[] = []
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== 'string' || !value.trim()) continue
    if (!/(script|expression)$/i.test(key)) continue
    rows.push({ key, code: value })
  }
  asArray(config.listeners).forEach((entry, index) => {
    const listener = parseObject(entry)
    if (!listener) return
    for (const [key, value] of Object.entries(listener)) {
      if (typeof value !== 'string' || !value.trim()) continue
      if (!/(script|expression)$/i.test(key)) continue
      rows.push({ key: `listeners[${index}].${key}`, code: value })
    }
  })
  return rows
}

/** 节点级「开始前」触发器：event=NODE_ENTERING/NODE_BEFORE 且 nodeKey/nodeId/target 指向该节点。 */
export function snapshotNodeTriggerBindings(
  graph: unknown,
  nodeId: string,
): SnapshotNodeTriggerBinding[] {
  const parsed = parseObject(graph)
  return asArray(parsed?.triggers).flatMap((entry) => {
    if (!isRecord(entry)) return []
    const event = text(entry.event).trim().toUpperCase()
    if (event !== 'NODE_ENTERING' && event !== 'NODE_BEFORE') return []
    const target = text(entry.nodeKey) || text(entry.nodeId) || text(entry.target)
    if (target !== nodeId) return []
    return [
      {
        triggerId: text(entry.triggerId),
        name: text(entry.name) || text(entry.triggerId),
        event,
        script: text(entry.script),
      },
    ]
  })
}

export function snapshotNodeOperations(config: Record<string, unknown>): SnapshotNodeOperationView {
  return {
    allowedActions: stringArray(config.allowedActions),
    returnTargets: stringArray(config.returnTargets),
  }
}

/** 高级/操作面里除基础字段外的真实配置项；空对象不产生行。 */
export function snapshotNodeAdvancedEntries(
  config: Record<string, unknown>,
): SnapshotNodeAdvancedEntry[] {
  const surfaced = new Set([
    'name',
    'participant',
    'approver',
    'fieldStates',
    'fieldPermissions',
    'opinionForm',
    'allowedActions',
    'returnTargets',
    'condition',
    'conditionExpression',
    'expression',
    'expr',
    'conditionScript',
  ])
  return Object.entries(config)
    .filter(([key, value]) => {
      if (surfaced.has(key)) return false
      if (typeof value === 'string' && /(script|expression)$/i.test(key)) return false
      return value != null && snapshotValueText(value) !== ''
    })
    .map(([key, value]) => ({ key, value }))
}

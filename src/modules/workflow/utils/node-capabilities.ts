import { i18n } from '@/locales'
import type {
  BpmNodeCapability,
  BpmNodeConfigField,
  BpmNodeTopology,
  BpmNodeSupports,
  DynamicParallelConfig,
  DynamicParallelEmptyStrategy,
  DynamicParallelInvalidStrategy,
  DynamicParallelMode,
  DynamicParallelSource,
  DynamicParallelSourceType,
  ParticipantConfig,
  ParticipantFormFieldObjectType,
  ParticipantFormFieldScope,
  ParticipantFormFieldValue,
  ParticipantStrategy,
} from '@/contracts/bpm-node'

/** 现有流程主链的稳定类型，非节点目录；用于保留 P57 既有兼容入口。 */
export const REQUIRED_WORKFLOW_NODE_TYPES = ['START', 'END', 'APPROVAL'] as const

export type WorkflowMiddleNodeType =
  | 'APPROVAL'
  | 'CONSENSUS'
  | 'CONDITION'
  | 'COPY'
  | 'NOTIFICATION'
  | 'P57_VERIFY'

export class NodeCapabilityContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NodeCapabilityContractError'
  }
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function contractError(path: string, message: string): never {
  throw new NodeCapabilityContractError(
    i18n.global.t('workflow.nodeCapabilityInvalid', { path, message }),
  )
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    contractError(path, i18n.global.t('workflow.mustBeNonEmptyString'))
  }
  return value
}

function requiredBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    contractError(path, i18n.global.t('workflow.mustBeBoolean'))
  }
  return value
}

function requiredNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    contractError(path, i18n.global.t('workflow.mustBeNonNegativeInteger'))
  }
  return value
}

function optionalMaxInteger(value: unknown, path: string): number | null {
  if (value === null) return null
  return requiredNonNegativeInteger(value, path)
}

function parseTopology(value: unknown, path: string): BpmNodeTopology {
  if (!isRecord(value)) contractError(path, i18n.global.t('common.mustBeObject'))

  const topology = {
    minIncoming: requiredNonNegativeInteger(value.minIncoming, `${path}.minIncoming`),
    maxIncoming: optionalMaxInteger(value.maxIncoming, `${path}.maxIncoming`),
    minOutgoing: requiredNonNegativeInteger(value.minOutgoing, `${path}.minOutgoing`),
    maxOutgoing: optionalMaxInteger(value.maxOutgoing, `${path}.maxOutgoing`),
  }

  if (topology.maxIncoming !== null && topology.maxIncoming < topology.minIncoming) {
    contractError(`${path}.maxIncoming`, i18n.global.t('workflow.maxIncomingBelowMin'))
  }
  if (topology.maxOutgoing !== null && topology.maxOutgoing < topology.minOutgoing) {
    contractError(`${path}.maxOutgoing`, i18n.global.t('workflow.maxOutgoingBelowMin'))
  }
  return topology
}

function parseConfigFields(value: unknown, path: string): BpmNodeConfigField[] {
  if (!Array.isArray(value)) contractError(path, i18n.global.t('workflow.mustBeArray'))

  const keys = new Set<string>()
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) contractError(itemPath, i18n.global.t('common.mustBeObject'))
    const validation = item.validation
    if (validation !== undefined && !isRecord(validation)) {
      contractError(`${itemPath}.validation`, i18n.global.t('common.mustBeObject'))
    }
    const field = {
      key: requiredString(item.key, `${itemPath}.key`),
      label: requiredString(item.label, `${itemPath}.label`),
      type: requiredString(item.type, `${itemPath}.type`),
      required: requiredBoolean(item.required, `${itemPath}.required`),
      ...(validation === undefined ? {} : { validation }),
    }
    if (keys.has(field.key))
      contractError(
        `${itemPath}.key`,
        i18n.global.t('workflow.duplicateConfigField', { key: field.key }),
      )
    keys.add(field.key)
    return field
  })
}

function parseSupports(value: unknown, path: string): BpmNodeSupports {
  if (!isRecord(value)) contractError(path, i18n.global.t('common.mustBeObject'))
  return {
    design: requiredBoolean(value.design, `${path}.design`),
    save: requiredBoolean(value.save, `${path}.save`),
    publish: requiredBoolean(value.publish, `${path}.publish`),
    run: requiredBoolean(value.run, `${path}.run`),
  }
}

/** 将 request 返回的 unknown 解析为严格能力清单；未知形状不会静默降级。 */
export function parseBpmNodeCapabilities(input: unknown): BpmNodeCapability[] {
  if (!Array.isArray(input)) {
    contractError('data', i18n.global.t('workflow.mustBeCapabilityArray'))
  }
  if (input.length === 0) {
    contractError('data', i18n.global.t('workflow.capabilityListEmpty'))
  }

  const types = new Set<string>()
  return input.map((item, index) => {
    const itemPath = `data[${index}]`
    if (!isRecord(item)) contractError(itemPath, i18n.global.t('common.mustBeObject'))

    const capability: BpmNodeCapability = {
      type: requiredString(item.type, `${itemPath}.type`),
      displayName: requiredString(item.displayName, `${itemPath}.displayName`),
      description: requiredString(item.description, `${itemPath}.description`),
      category: requiredString(
        item.category,
        `${itemPath}.category`,
      ) as BpmNodeCapability['category'],
      version: requiredString(item.version, `${itemPath}.version`),
      topology: parseTopology(item.topology, `${itemPath}.topology`),
      configFields: parseConfigFields(item.configFields, `${itemPath}.configFields`),
      supports: parseSupports(item.supports, `${itemPath}.supports`),
    }

    if (!['EVENT', 'TASK', 'GATEWAY', 'OTHER'].includes(capability.category)) {
      contractError(
        `${itemPath}.category`,
        i18n.global.t('workflow.unsupportedNodeCategory', { category: capability.category }),
      )
    }
    if (types.has(capability.type)) {
      contractError(
        `${itemPath}.type`,
        i18n.global.t('workflow.duplicateNodeType', { type: capability.type }),
      )
    }
    types.add(capability.type)
    return capability
  })
}

function isFullySupported(capability: BpmNodeCapability): boolean {
  return (
    capability.supports.design &&
    capability.supports.save &&
    capability.supports.publish &&
    capability.supports.run
  )
}

export function findNodeCapability(
  capabilities: readonly BpmNodeCapability[],
  type: string,
): BpmNodeCapability | undefined {
  return capabilities.find((capability) => capability.type === type)
}

/**
 * 普通审批是流程设计器的新建默认；只有已有验证图或用户显式选择时才使用隔离节点。
 * 不能因为隔离 profile 暴露了 P57_VERIFY，就静默替换既有 APPROVAL 主链。
 */
export function resolveWorkflowMiddleNodeType(existingType?: string): WorkflowMiddleNodeType {
  return ['APPROVAL', 'CONSENSUS', 'CONDITION', 'COPY', 'NOTIFICATION', 'P57_VERIFY'].includes(
    existingType ?? '',
  )
    ? (existingType as WorkflowMiddleNodeType)
    : 'APPROVAL'
}

/** 设计器只允许完整打通设计、保存、发布、运行链的能力进入正常消费态。 */
export function getDesignableNodeCapabilities(
  capabilities: readonly BpmNodeCapability[],
): BpmNodeCapability[] {
  return capabilities.filter(isFullySupported)
}

export function assertRequiredNodeCapabilities(
  capabilities: readonly BpmNodeCapability[],
  requiredTypes: readonly string[] = REQUIRED_WORKFLOW_NODE_TYPES,
): void {
  const missing = requiredTypes.filter((type) => {
    const capability = findNodeCapability(capabilities, type)
    return capability === undefined || !isFullySupported(capability)
  })
  if (missing.length > 0) {
    throw new NodeCapabilityContractError(
      i18n.global.t('workflow.nodeCapabilitiesUnavailable', {
        missing: missing.join(i18n.global.t('common.enumSeparator')),
      }),
    )
  }
}

interface GraphElementLike {
  id?: unknown
  kind?: unknown
  type?: unknown
  source?: unknown
  target?: unknown
  config?: unknown
}

interface GraphLike {
  elements?: unknown
}

function readConfigValue(config: UnknownRecord, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!isRecord(current)) return undefined
    return current[part]
  }, config)
}

function hasConfigValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0 && value.some(hasConfigValue)
  if (isRecord(value) && 'value' in value) return hasConfigValue(value.value)
  return true
}

function checkTopology(
  nodeType: string,
  nodeId: string,
  topology: BpmNodeTopology,
  incoming: number,
  outgoing: number,
): string[] {
  const errors: string[] = []
  if (incoming < topology.minIncoming) {
    errors.push(
      i18n.global.t('workflow.nodeIncomingTooFew', {
        nodeId,
        nodeType,
        minIncoming: topology.minIncoming,
      }),
    )
  }
  if (topology.maxIncoming !== null && incoming > topology.maxIncoming) {
    errors.push(
      i18n.global.t('workflow.nodeIncomingTooMany', {
        nodeId,
        nodeType,
        maxIncoming: topology.maxIncoming,
      }),
    )
  }
  if (outgoing < topology.minOutgoing) {
    errors.push(
      i18n.global.t('workflow.nodeOutgoingTooFew', {
        nodeId,
        nodeType,
        minOutgoing: topology.minOutgoing,
      }),
    )
  }
  if (topology.maxOutgoing !== null && outgoing > topology.maxOutgoing) {
    errors.push(
      i18n.global.t('workflow.nodeOutgoingTooMany', {
        nodeId,
        nodeType,
        maxOutgoing: topology.maxOutgoing,
      }),
    )
  }
  return errors
}

/**
 * 保存前只根据能力清单校验图，不替代后端发布校验。
 * requiredTypes 只由现有 BPM 主链调用，扩展节点不会在此处增加静态类型表。
 */
export function validateProcessGraphCapabilities(
  graph: GraphLike,
  capabilities: readonly BpmNodeCapability[],
  requiredTypes: readonly string[] = [],
): string[] {
  if (!Array.isArray(graph.elements)) return [i18n.global.t('workflow.graphMissingElements')]

  const errors: string[] = []
  const nodeIds = new Set<string>()
  const nodes: Array<{
    id: string
    type: string
    element: GraphElementLike
    capability?: BpmNodeCapability
  }> = []
  const edges: Array<{ id: string; source: string; target: string }> = []

  for (const [index, raw] of graph.elements.entries()) {
    if (!isRecord(raw)) {
      errors.push(i18n.global.t('workflow.graphElementMustBeObject', { index }))
      continue
    }
    const element = raw as GraphElementLike
    if (element.kind === 'node') {
      if (typeof element.id !== 'string' || element.id.trim() === '') {
        errors.push(i18n.global.t('workflow.graphNodeMissingId', { index }))
        continue
      }
      if (nodeIds.has(element.id)) {
        errors.push(i18n.global.t('workflow.graphNodeDuplicateId', { id: element.id }))
        continue
      }
      nodeIds.add(element.id)
      if (typeof element.type !== 'string' || element.type.trim() === '') {
        errors.push(i18n.global.t('workflow.graphNodeMissingType', { id: element.id }))
        continue
      }
      const capability = findNodeCapability(capabilities, element.type)
      nodes.push({ id: element.id, type: element.type, element, capability })
      if (!capability) {
        errors.push(
          i18n.global.t('workflow.nodeUnknownType', { id: element.id, type: element.type }),
        )
        continue
      }
      if (!isFullySupported(capability)) {
        errors.push(
          i18n.global.t('workflow.nodeNotFullySupported', { id: element.id, type: element.type }),
        )
      }
      const config = isRecord(element.config) ? element.config : {}
      for (const field of capability.configFields) {
        if (field.required && !hasConfigValue(readConfigValue(config, field.key))) {
          errors.push(
            i18n.global.t('workflow.nodeMissingRequiredConfig', {
              id: element.id,
              type: element.type,
              label: field.label,
            }),
          )
        }
      }
    } else if (element.kind === 'edge') {
      if (typeof element.id !== 'string' || element.id.trim() === '') {
        errors.push(i18n.global.t('workflow.graphEdgeMissingId', { index }))
        continue
      }
      if (typeof element.source !== 'string' || element.source.trim() === '') {
        errors.push(i18n.global.t('workflow.graphEdgeMissingSource', { id: element.id }))
        continue
      }
      if (typeof element.target !== 'string' || element.target.trim() === '') {
        errors.push(i18n.global.t('workflow.graphEdgeMissingTarget', { id: element.id }))
        continue
      }
      edges.push({ id: element.id, source: element.source, target: element.target })
    } else {
      errors.push(i18n.global.t('workflow.graphElementKindUnsupported', { index }))
    }
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(i18n.global.t('workflow.graphEdgeDanglingRef', { id: edge.id }))
    }
  }

  for (const node of nodes) {
    if (!node.capability) continue
    const incoming = edges.filter((edge) => edge.target === node.id).length
    const outgoing = edges.filter((edge) => edge.source === node.id).length
    errors.push(...checkTopology(node.type, node.id, node.capability.topology, incoming, outgoing))
  }

  for (const requiredType of requiredTypes) {
    if (!nodes.some((node) => node.type === requiredType)) {
      errors.push(i18n.global.t('workflow.graphMissingRequiredNode', { requiredType }))
    }
  }

  return errors
}

/* ────────────────────────────────────────────────────────────────────
 * P63 参与人 / 动态并行语义（归一、构造、校验）
 *
 * 为什么不用 i18n：本批改动文件域不含 locale 资源，且错误口径需与
 * 服务端 /workflow/defs/node-capabilities 契约逐字对齐，故文案直接中文。
 * ──────────────────────────────────────────────────────────────────── */

/** 旧版 approver.type → 参与人策略（真实契约兼容 object 字段的既有取值）。 */
const LEGACY_APPROVER_TYPE_TO_STRATEGY: Record<string, ParticipantStrategy> = {
  DESIGNATED: 'FIXED_USER',
  ROLE_MEMBER: 'ROLE',
  ROLE: 'ROLE',
  DEPT_LEADER: 'DEPT_LEADER',
  POST: 'POST',
  DEPT_POST: 'DEPT_POST',
  EXPRESSION: 'EXPRESSION',
  ADAPTER: 'ADAPTER',
}

/** 字符串可能是 JSON 对象/数组文本时解析，其余原样返回（解析失败不抛错）。 */
function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

/** 原始值为 JSON 对象/数组文本（含解析失败的残串）：归一化时不应再按逗号 id 处理。 */
function looksLikeJsonText(raw: unknown): boolean {
  return typeof raw === 'string' && /^\s*[[{]/.test(raw)
}

/** 从 {strategy|type, value, adapterId} 形状构造 ParticipantConfig（只保留非空可选项）。 */
function participantConfigFromShape(
  strategy: ParticipantStrategy,
  source: UnknownRecord,
): ParticipantConfig {
  const config: ParticipantConfig = { strategy }
  if (source.value !== undefined) config.value = source.value as ParticipantConfig['value']
  if (typeof source.adapterId === 'string' && source.adapterId.trim() !== '') {
    config.adapterId = source.adapterId.trim()
  }
  return config
}

/** participant/approver 数据形态：empty=无配置；strategy=新形状；legacy=旧形状；unparsed=无法识别。 */
export type ParticipantShapeKind = 'empty' | 'strategy' | 'legacy' | 'unparsed'

/** 识别 participant/approver 数据形态（旧数据打开时给出兼容提示的依据）。 */
export function detectParticipantShape(raw: unknown): ParticipantShapeKind {
  const value = parseMaybeJson(raw)
  if (value === null || value === undefined || value === '') return 'empty'
  if (isRecord(value)) {
    if (typeof value.strategy === 'string' && value.strategy.trim() !== '') return 'strategy'
    if (typeof value.type === 'string' && value.type.trim() !== '') return 'legacy'
    return 'unparsed'
  }
  if (Array.isArray(value)) return value.length > 0 ? 'legacy' : 'empty'
  if (typeof value === 'number') return 'legacy'
  if (typeof value === 'string') {
    // JSON 文本解析失败（残串）：按无法识别处理，避免误当逗号 id
    if (looksLikeJsonText(raw)) return 'unparsed'
    return value.trim() === '' ? 'empty' : 'legacy'
  }
  return 'unparsed'
}

/**
 * 归一 participant/approver 旧/新形状 → {strategy, value}：
 * - 新形状 {strategy, value, adapterId?} 原样保留；
 * - 旧形状 {type: 'DESIGNATED', value: […]}、逗号分隔用户 id 字符串、id 数组 → FIXED_USER；
 * - 无法识别返回 null（调用方保留原值，由服务端校验报错）。
 */
export function normalizeParticipantConfig(raw: unknown): ParticipantConfig | null {
  const value = parseMaybeJson(raw)
  if (value === null || value === undefined || value === '') return null
  if (isRecord(value)) {
    const strategy = typeof value.strategy === 'string' ? value.strategy.trim() : ''
    if (strategy !== '') {
      return participantConfigFromShape(strategy as ParticipantStrategy, value)
    }
    const legacyType = typeof value.type === 'string' ? value.type.trim() : ''
    const mapped = legacyType !== '' ? LEGACY_APPROVER_TYPE_TO_STRATEGY[legacyType] : undefined
    return mapped ? participantConfigFromShape(mapped, value) : null
  }
  if (typeof value === 'number') return { strategy: 'FIXED_USER', value }
  if (Array.isArray(value)) {
    return value.length > 0
      ? { strategy: 'FIXED_USER', value: value.map((item) => String(item)) }
      : null
  }
  if (typeof value === 'string') {
    // JSON 文本解析失败（残串）不做兼容猜测，保留原值交由服务端校验
    if (looksLikeJsonText(raw)) return null
    // 旧 mock 结构化 APPROVER 语义：逗号分隔用户 id 字符串
    const ids = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    return ids.length > 0 ? { strategy: 'FIXED_USER', value: ids } : null
  }
  return null
}

/** 属性面板参与人草稿（与节点 config 的 participant/approver 值一一对应）。 */
export interface ParticipantFormFieldDraft {
  objectType: ParticipantFormFieldObjectType
  scope: ParticipantFormFieldScope
  field: string
  tableField: string
  column: string
}

export interface ParticipantFormDraft {
  strategy: ParticipantStrategy
  /** FIXED_USER：人员多选（用户 id 十进制字符串，保持 64 位精度）。 */
  userIds: string[]
  /** DEPT_LEADER：部门多选（部门 id 字符串）。 */
  deptIds: string[]
  /** ROLE/POST/DEPT_POST/EXPRESSION/ADAPTER 的通用取值（多个以英文逗号分隔）。 */
  genericValue: string
  /** ADAPTER：外部适配器 id。 */
  adapterId: string
  /** FORM_FIELD：来源表单绑定。 */
  formField: ParticipantFormFieldDraft
}

export function emptyParticipantFormDraft(): ParticipantFormDraft {
  return {
    strategy: 'FIXED_USER',
    userIds: [],
    deptIds: [],
    genericValue: '',
    adapterId: '',
    formField: { objectType: 'USER', scope: 'MAIN', field: '', tableField: '', column: '' },
  }
}

function participantFormFieldDraft(value: unknown): ParticipantFormFieldDraft {
  const draft = emptyParticipantFormDraft().formField
  if (!isRecord(value)) return draft
  if (value.objectType === 'USER' || value.objectType === 'DEPT')
    draft.objectType = value.objectType
  if (value.scope === 'MAIN' || value.scope === 'TABLE') draft.scope = value.scope
  if (typeof value.field === 'string') draft.field = value.field
  if (typeof value.tableField === 'string') draft.tableField = value.tableField
  if (typeof value.column === 'string') draft.column = value.column
  return draft
}

/**
 * 节点 config 的 participant/approver 值 → 面板草稿（旧数据兼容展示的归一路径）。
 * shape 一并返回，供面板提示「保存后将升级为 strategy 形状」。
 */
export function buildParticipantFormDraft(raw: unknown): {
  draft: ParticipantFormDraft
  shape: ParticipantShapeKind
} {
  const shape = detectParticipantShape(raw)
  if (shape === 'empty' || shape === 'unparsed') {
    return { draft: emptyParticipantFormDraft(), shape }
  }
  const config = normalizeParticipantConfig(raw)
  if (!config) return { draft: emptyParticipantFormDraft(), shape }
  const draft = emptyParticipantFormDraft()
  draft.strategy = config.strategy
  const value = config.value
  switch (config.strategy) {
    case 'FIXED_USER':
      if (Array.isArray(value)) draft.userIds = value.map((item) => String(item))
      else if (typeof value === 'string') draft.userIds = value.split(',').filter(Boolean)
      else if (typeof value === 'number') draft.userIds = [String(value)]
      break
    case 'DEPT_LEADER':
      if (Array.isArray(value)) draft.deptIds = value.map((item) => String(item))
      else if (typeof value === 'string') draft.deptIds = value.split(',').filter(Boolean)
      break
    case 'FORM_FIELD':
      draft.formField = participantFormFieldDraft(value)
      break
    default:
      if (Array.isArray(value)) draft.genericValue = value.map((item) => String(item)).join(',')
      else if (typeof value === 'string' || typeof value === 'number') {
        draft.genericValue = String(value)
      }
      break
  }
  if (config.adapterId) draft.adapterId = config.adapterId
  return { draft, shape }
}

/** FORM_FIELD 来源表单绑定 → value 对象（scope=TABLE 才携带 tableField/column）。 */
export function buildParticipantFormFieldValue(
  form: ParticipantFormFieldDraft,
): ParticipantFormFieldValue {
  const value: ParticipantFormFieldValue = {
    objectType: form.objectType,
    scope: form.scope,
    field: form.field.trim(),
  }
  if (form.scope === 'TABLE') {
    value.tableField = form.tableField.trim()
    value.column = form.column.trim()
  }
  return value
}

/** 面板草稿 → 服务端契约形状 {strategy, value}（object 字段 JSON 序列化路径既有）。 */
export function buildParticipantConfig(draft: ParticipantFormDraft): ParticipantConfig {
  const config: ParticipantConfig = { strategy: draft.strategy }
  switch (draft.strategy) {
    case 'FIXED_USER':
      config.value = [...draft.userIds]
      break
    case 'DEPT_LEADER':
      config.value = [...draft.deptIds]
      break
    case 'FORM_FIELD':
      config.value = buildParticipantFormFieldValue(draft.formField)
      break
    case 'ADAPTER':
      if (draft.genericValue.trim() !== '') config.value = draft.genericValue.trim()
      if (draft.adapterId.trim() !== '') config.adapterId = draft.adapterId.trim()
      break
    default:
      if (draft.genericValue.trim() !== '') config.value = draft.genericValue.trim()
      break
  }
  return config
}

/**
 * participant/approver 语义校验（保存前前置口径，与服务端一致）：
 * FORM_FIELD 缺 field / scope=TABLE 缺 tableField 或 column 给出中文错误。
 */
export function validateParticipantConfigErrors(raw: unknown): string[] {
  const config = normalizeParticipantConfig(raw)
  if (!config || config.strategy !== 'FORM_FIELD') return []
  const value = parseMaybeJson(config.value)
  if (!isRecord(value)) {
    return ['表单字段参与人取值必须为对象（{objectType, scope, field}）']
  }
  const errors: string[] = []
  if (typeof value.field !== 'string' || value.field.trim() === '') {
    errors.push('表单字段参与人缺少主字段名（field）')
  }
  if (
    value.objectType !== undefined &&
    value.objectType !== 'USER' &&
    value.objectType !== 'DEPT'
  ) {
    errors.push(`表单字段参与人 objectType 非法：${String(value.objectType)}（仅支持 USER/DEPT）`)
  }
  if (value.scope !== undefined && value.scope !== 'MAIN' && value.scope !== 'TABLE') {
    errors.push(`表单字段参与人 scope 非法：${String(value.scope)}（仅支持 MAIN/TABLE）`)
  }
  if (value.scope === 'TABLE') {
    if (typeof value.tableField !== 'string' || value.tableField.trim() === '') {
      errors.push('表单字段参与人 scope=TABLE 时缺少表格字段名（tableField）')
    }
    if (typeof value.column !== 'string' || value.column.trim() === '') {
      errors.push('表单字段参与人 scope=TABLE 时缺少列字段名（column）')
    }
  }
  return errors
}

/** 属性面板动态并行草稿（semanticVersion 开关以 objectSemantic 承载）。 */
export interface DynamicParallelFormDraft {
  sourceType: DynamicParallelSourceType
  /** 来源取值：FORM_FIELD/VARIABLE=字段名/变量名；FIXED=固定值（多人以英文逗号分隔）。 */
  sourceValue: string
  /** 新语义（按对象分支）的对象类型：USER=逐人分支；DEPT=逐部门分支。 */
  objectType: ParticipantFormFieldObjectType
  scope: ParticipantFormFieldScope
  tableField: string
  column: string
  mode: DynamicParallelMode
  ratio: number | null
  maxBranches: number | null
  emptyStrategy: DynamicParallelEmptyStrategy
  invalidStrategy: DynamicParallelInvalidStrategy
  /** 勾选=写入 semanticVersion:2；不勾=旧语义，不写该键。 */
  objectSemantic: boolean
}

const DYNAMIC_PARALLEL_SOURCE_TYPES: readonly DynamicParallelSourceType[] = [
  'FORM_FIELD',
  'VARIABLE',
  'FIXED',
]
const DYNAMIC_PARALLEL_MODES: readonly DynamicParallelMode[] = ['ALL', 'ANY', 'RATIO', 'VETO']
const DYNAMIC_PARALLEL_EMPTY_STRATEGIES: readonly DynamicParallelEmptyStrategy[] = [
  'BLOCK',
  'PROCEED',
]
const DYNAMIC_PARALLEL_INVALID_STRATEGIES: readonly DynamicParallelInvalidStrategy[] = [
  'BLOCK',
  'SKIP',
]

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function pickOptionalNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 节点 config → 动态并行面板草稿（回显）。空配置返回默认草稿（旧语义、不勾新语义）。
 */
export function buildDynamicParallelFormDraft(config: unknown): DynamicParallelFormDraft {
  const draft: DynamicParallelFormDraft = {
    sourceType: 'FORM_FIELD',
    sourceValue: '',
    objectType: 'USER',
    scope: 'MAIN',
    tableField: '',
    column: '',
    mode: 'ALL',
    ratio: null,
    maxBranches: null,
    emptyStrategy: 'BLOCK',
    invalidStrategy: 'SKIP',
    objectSemantic: false,
  }
  if (!isRecord(config)) return draft
  const source = parseMaybeJson(config.source)
  if (isRecord(source)) {
    draft.sourceType = pickEnum(source.type, DYNAMIC_PARALLEL_SOURCE_TYPES, 'FORM_FIELD')
    const value = source.value
    if (Array.isArray(value)) draft.sourceValue = value.map((item) => String(item)).join(',')
    else if (typeof value === 'string' || typeof value === 'number')
      draft.sourceValue = String(value)
    if (source.objectType === 'USER' || source.objectType === 'DEPT') {
      draft.objectType = source.objectType
    }
    if (source.scope === 'MAIN' || source.scope === 'TABLE') draft.scope = source.scope
    if (typeof source.tableField === 'string') draft.tableField = source.tableField
    if (typeof source.column === 'string') draft.column = source.column
  }
  draft.mode = pickEnum(config.mode, DYNAMIC_PARALLEL_MODES, 'ALL')
  draft.emptyStrategy = pickEnum(config.emptyStrategy, DYNAMIC_PARALLEL_EMPTY_STRATEGIES, 'BLOCK')
  draft.invalidStrategy = pickEnum(
    config.invalidStrategy,
    DYNAMIC_PARALLEL_INVALID_STRATEGIES,
    'SKIP',
  )
  draft.ratio = pickOptionalNumber(config.ratio)
  draft.maxBranches = pickOptionalNumber(config.maxBranches)
  // 只有显式 2 视为新语义；缺省/其它值按旧语义展示（不写该键）
  draft.objectSemantic = Number(config.semanticVersion) === 2
  return draft
}

/** 面板草稿 → DYNAMIC_PARALLEL config：勾选新语义写 semanticVersion:2，旧语义不写该键。 */
export function buildDynamicParallelConfig(draft: DynamicParallelFormDraft): DynamicParallelConfig {
  const source: DynamicParallelSource = {
    type: draft.sourceType,
    value: draft.sourceValue.trim(),
    scope: draft.scope,
  }
  if (draft.scope === 'TABLE') {
    source.tableField = draft.tableField.trim()
    source.column = draft.column.trim()
  }
  // objectType 只在新语义（按对象分支）下有含义，面板也仅在勾选后展示
  if (draft.objectSemantic) source.objectType = draft.objectType
  const config: DynamicParallelConfig = {
    source,
    mode: draft.mode,
    emptyStrategy: draft.emptyStrategy,
    invalidStrategy: draft.invalidStrategy,
  }
  if (draft.mode === 'RATIO' && draft.ratio !== null) config.ratio = draft.ratio
  if (draft.maxBranches !== null && draft.maxBranches > 0) config.maxBranches = draft.maxBranches
  if (draft.objectSemantic) config.semanticVersion = 2
  return config
}

/**
 * DYNAMIC_PARALLEL config 语义校验（保存前前置口径，与服务端一致）：
 * semanticVersion=2 缺 objectType、scope=TABLE 缺 tableField/column、来源缺取值。
 */
export function validateDynamicParallelConfigErrors(config: unknown): string[] {
  if (!isRecord(config)) return []
  const errors: string[] = []
  const source = parseMaybeJson(config.source)
  if (!isRecord(source)) {
    return ['动态并行缺少分支来源（source）']
  }
  if (
    config.semanticVersion !== undefined &&
    config.semanticVersion !== null &&
    Number(config.semanticVersion) !== 1 &&
    Number(config.semanticVersion) !== 2
  ) {
    errors.push('动态并行 semanticVersion 非法：仅支持 1（旧语义）或 2（按对象分支）')
  }
  if (Number(config.semanticVersion) === 2) {
    if (source.objectType !== 'USER' && source.objectType !== 'DEPT') {
      errors.push('动态并行新语义（按对象分支）缺少 objectType（USER/DEPT）')
    }
  }
  if (source.scope === 'TABLE') {
    if (typeof source.tableField !== 'string' || source.tableField.trim() === '') {
      errors.push('动态并行来源 scope=TABLE 时缺少表格字段名（tableField）')
    }
    if (typeof source.column !== 'string' || source.column.trim() === '') {
      errors.push('动态并行来源 scope=TABLE 时缺少列字段名（column）')
    }
  }
  if (source.type === 'FORM_FIELD' || source.type === 'VARIABLE') {
    const value = source.value
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    if (empty) {
      errors.push(`动态并行来源类型为 ${String(source.type)} 时缺少取值（value）`)
    }
  }
  return errors
}

/**
 * P63 保存前语义校验：只覆盖本批新增配置口径（participant FORM_FIELD / 动态并行），
 * 不替代能力清单必填校验与服务端发布校验；错误带节点定位前缀，可直接展示。
 */
export function validateNodeConfigSemantics(graph: GraphLike): string[] {
  if (!Array.isArray(graph.elements)) return []
  const errors: string[] = []
  for (const raw of graph.elements) {
    if (!isRecord(raw) || raw.kind !== 'node') continue
    const id = typeof raw.id === 'string' ? raw.id : ''
    const type = typeof raw.type === 'string' ? raw.type : ''
    const config = isRecord(raw.config) ? raw.config : {}
    const name =
      typeof config.name === 'string' && config.name.trim() !== '' ? config.name.trim() : id
    const prefix = `节点 ${name}${type !== '' ? `（${type}）` : ''}`
    if ('participant' in config || 'approver' in config) {
      const participantRaw = 'participant' in config ? config.participant : config.approver
      errors.push(
        ...validateParticipantConfigErrors(participantRaw).map(
          (message) => `${prefix}：${message}`,
        ),
      )
    }
    if (type === 'DYNAMIC_PARALLEL') {
      errors.push(
        ...validateDynamicParallelConfigErrors(config).map((message) => `${prefix}：${message}`),
      )
    }
  }
  return errors
}

import { i18n } from '@/locales'
import type {
  BpmNodeCapability,
  BpmNodeConfigField,
  BpmNodeTopology,
  BpmNodeSupports,
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

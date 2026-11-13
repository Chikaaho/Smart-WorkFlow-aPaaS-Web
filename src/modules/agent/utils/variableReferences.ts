/**
 * 变量引用（G1-5）。
 *
 * 语法双轨：
 * - 旧写法 `{{变量名}}`（全局累积变量）继续可用；
 * - 新写法 `{{节点ID.变量名}}` 引用上游节点输出，发布时校验可达性。
 *
 * 本文件提供：
 * - 上游可达计算（反向 BFS，忽略环）；
 * - 变量候选分组（开始节点参数 + 上游节点输出变量）；
 * - 模板引用解析；
 * - 发布前校验（参数声明 + 模板引用），返回精确到节点/字段/引用的错误清单。
 */
import type { FlowGraphEdge, FlowGraphNode } from '@/adapters/flow-graph'
import {
  DEFAULT_VARIABLE_NAME,
  NODE_CONFIG_KEY_INPUT_PARAMS,
  NODE_CONFIG_KEY_OUTPUT_PARAMS,
  NODE_CONFIG_KEY_OUTPUT_VAR,
  NODE_CONFIG_KEY_SYSTEM_PROMPT,
  NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE,
  NODE_TYPE_START,
} from './graphAdapter'
import { i18n } from '@/locales'

export interface VariableCandidate {
  /** 引用文本（含花括号），如 `{{n-1.output}}`、`{{question}}` */
  reference: string
  /** 变量名（不带花括号，用于写 inputVar 等名称字段） */
  name: string
}

export interface VariableGroup {
  nodeId: string
  label: string
  variables: VariableCandidate[]
}

export interface VariableValidationError {
  nodeId: string
  nodeLabel: string
  /** 字段展示名（i18n 后文案） */
  field: string
  reference: string
  reason: string
}

const TEMPLATE_FIELDS: Array<{ key: string; labelKey: string }> = [
  { key: NODE_CONFIG_KEY_SYSTEM_PROMPT, labelKey: 'agent.systemPromptLabel' },
  { key: NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE, labelKey: 'agent.userPromptLabel' },
]

function t(key: string, params?: Record<string, unknown>): string {
  return i18n.global.t(key, params ?? {})
}

/** 目标节点的全部上游节点（反向 BFS；不含自身） */
export function upstreamNodeIds(nodeId: string, edges: FlowGraphEdge[]): Set<string> {
  const upstream = new Set<string>()
  const queue = [nodeId]
  const visited = new Set<string>([nodeId])
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const edge of edges) {
      if (edge.target !== current) continue
      if (visited.has(edge.source)) continue
      visited.add(edge.source)
      upstream.add(edge.source)
      queue.push(edge.source)
    }
  }
  return upstream
}

/** 节点输出变量名（config.outputVar，缺省 = 默认变量 input） */
export function nodeOutputVar(node: FlowGraphNode): string {
  const configured = node.data?.[NODE_CONFIG_KEY_OUTPUT_VAR]
  return typeof configured === 'string' && configured.trim()
    ? configured.trim()
    : DEFAULT_VARIABLE_NAME
}

/** 开始节点声明的参数名清单（只取非空名称） */
export function startParamNames(nodes: FlowGraphNode[]): string[] {
  const start = nodes.find((n) => n.type === NODE_TYPE_START)
  const raw = start?.data?.[NODE_CONFIG_KEY_INPUT_PARAMS]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => String(p.name ?? '').trim())
    .filter(Boolean)
}

/**
 * 当前节点的可用变量分组：开始节点参数（全局写法）+ 上游节点输出（节点作用域写法）。
 * 开始节点自身无上游 → 空分组。
 */
export function buildVariableGroups(
  node: FlowGraphNode,
  nodes: FlowGraphNode[],
  edges: FlowGraphEdge[],
): VariableGroup[] {
  const groups: VariableGroup[] = []
  const start = nodes.find((n) => n.type === NODE_TYPE_START)
  if (start && start.id !== node.id) {
    const params = startParamNames(nodes).map((name) => ({ name, reference: `{{${name}}}` }))
    if (params.length > 0) {
      groups.push({ nodeId: start.id, label: t('agent.nodeStart'), variables: params })
    } else {
      groups.push({
        nodeId: start.id,
        label: t('agent.nodeStart'),
        variables: [{ name: DEFAULT_VARIABLE_NAME, reference: `{{${DEFAULT_VARIABLE_NAME}}}` }],
      })
    }
  }

  const upstream = upstreamNodeIds(node.id, edges)
  for (const nodeId of upstream) {
    const source = nodes.find((n) => n.id === nodeId)
    if (!source || source.type === NODE_TYPE_START) continue
    const outputVar = nodeOutputVar(source)
    groups.push({
      nodeId: source.id,
      label: source.label || source.id,
      variables: [{ name: outputVar, reference: `{{${source.id}.${outputVar}}}` }],
    })
  }
  return groups
}

/** 提取模板中的全部变量引用（去掉花括号，保留原文以便报错定位） */
export function extractVariableRefs(text: string): string[] {
  const refs: string[] = []
  const pattern = /\{\{\s*([^{}]+?)\s*\}\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    refs.push(match[1])
  }
  return refs
}

interface ResolveContext {
  /** 开始节点参数名 */
  params: string[]
  /** 节点 id → 输出变量名（含全部节点，校验时按可达集合过滤） */
  outputVarById: Map<string, string>
  /** 节点 id → 展示名 */
  labelById: Map<string, string>
  /** 目标节点上游集合 */
  upstream: Set<string>
}

function resolveContext(
  node: FlowGraphNode,
  nodes: FlowGraphNode[],
  edges: FlowGraphEdge[],
): ResolveContext {
  return {
    params: startParamNames(nodes),
    outputVarById: new Map(nodes.map((n) => [n.id, nodeOutputVar(n)])),
    labelById: new Map(nodes.map((n) => [n.id, n.label || n.id])),
    upstream: upstreamNodeIds(node.id, edges),
  }
}

function upstreamOutputVars(ctx: ResolveContext): string[] {
  return Array.from(ctx.upstream)
    .map((id) => ctx.outputVarById.get(id))
    .filter((name): name is string => !!name)
}

/**
 * 校验单个引用；返回错误文案（合法返回 null）。
 * - 节点作用域（含 `.`）：节点必须存在、是上游、变量名匹配其输出；
 * - 全局写法：必须命中开始节点参数 / 上游节点输出变量 / 默认变量 input（无参数时）。
 * - 开始节点自身允许引用自身参数（输入在运行前注入）。
 */
function checkReference(ref: string, node: FlowGraphNode, ctx: ResolveContext): string | null {
  if (ref.includes('.')) {
    const dot = ref.indexOf('.')
    const targetId = ref.slice(0, dot).trim()
    const varName = ref.slice(dot + 1).trim()
    if (!ctx.outputVarById.has(targetId)) {
      return t('agent.varRefNodeMissing', { nodeId: targetId })
    }
    if (targetId === node.id) {
      return t('agent.varRefSelf', { nodeId: targetId })
    }
    if (!ctx.upstream.has(targetId)) {
      return t('agent.varRefNotUpstream', { nodeId: targetId })
    }
    if (ctx.outputVarById.get(targetId) !== varName) {
      return t('agent.varRefVarMissing', {
        nodeId: targetId,
        varName,
        expected: ctx.outputVarById.get(targetId),
      })
    }
    return null
  }

  const allowed = new Set<string>([...ctx.params, ...upstreamOutputVars(ctx)])
  if (ctx.params.length === 0) allowed.add(DEFAULT_VARIABLE_NAME)
  // 开始节点自身的参数声明在运行前注入，允许引用
  if (node.type === NODE_TYPE_START) {
    for (const name of ctx.params) allowed.add(name)
  }
  return allowed.has(ref) ? null : t('agent.varRefGlobalMissing', { name: ref })
}

/**
 * 发布前校验：开始参数声明 + 结束输出声明 + 模板变量引用。
 * 返回空数组 = 通过。
 */
export function validateGraphVariables(
  nodes: FlowGraphNode[],
  edges: FlowGraphEdge[],
): VariableValidationError[] {
  const errors: VariableValidationError[] = []
  const start = nodes.find((n) => n.type === NODE_TYPE_START)

  // 开始节点参数：名称非空且唯一
  if (start) {
    const rawParams = start.data?.[NODE_CONFIG_KEY_INPUT_PARAMS]
    if (Array.isArray(rawParams)) {
      const seen = new Set<string>()
      for (const raw of rawParams) {
        if (!raw || typeof raw !== 'object') continue
        const name = String((raw as Record<string, unknown>).name ?? '').trim()
        if (!name) {
          errors.push({
            nodeId: start.id,
            nodeLabel: start.label || start.id,
            field: t('agent.startParamsTitle'),
            reference: '',
            reason: t('agent.paramNameRequired'),
          })
          continue
        }
        if (seen.has(name)) {
          errors.push({
            nodeId: start.id,
            nodeLabel: start.label || start.id,
            field: t('agent.startParamsTitle'),
            reference: name,
            reason: t('agent.paramNameDuplicate'),
          })
        }
        seen.add(name)
      }
    }
  }

  // 结束节点输出：名称/来源非空；来源若是节点作用域引用，需可达
  const end = nodes.find((n) => n.type === 'END')
  if (end) {
    const rawOutputs = end.data?.[NODE_CONFIG_KEY_OUTPUT_PARAMS]
    if (Array.isArray(rawOutputs)) {
      const outputCtx = resolveContext(end, nodes, edges)
      const seen = new Set<string>()
      for (const raw of rawOutputs) {
        if (!raw || typeof raw !== 'object') continue
        const item = raw as Record<string, unknown>
        const name = String(item.name ?? '').trim()
        const source = String(item.source ?? '').trim()
        if (!name || !source) {
          errors.push({
            nodeId: end.id,
            nodeLabel: end.label || end.id,
            field: t('agent.endOutputsTitle'),
            reference: name || source,
            reason: t('agent.outputNameSourceRequired'),
          })
          continue
        }
        if (seen.has(name)) {
          errors.push({
            nodeId: end.id,
            nodeLabel: end.label || end.id,
            field: t('agent.endOutputsTitle'),
            reference: name,
            reason: t('agent.outputNameDuplicate'),
          })
        }
        seen.add(name)
        const reason = checkReference(source, end, outputCtx)
        if (reason) {
          errors.push({
            nodeId: end.id,
            nodeLabel: end.label || end.id,
            field: t('agent.endOutputsTitle'),
            reference: source,
            reason,
          })
        }
      }
    }
  }

  // 模板字段引用
  for (const node of nodes) {
    const ctx = resolveContext(node, nodes, edges)
    for (const field of TEMPLATE_FIELDS) {
      const text = node.data?.[field.key]
      if (typeof text !== 'string' || !text.includes('{{')) continue
      for (const ref of extractVariableRefs(text)) {
        const reason = checkReference(ref, node, ctx)
        if (reason) {
          errors.push({
            nodeId: node.id,
            nodeLabel: node.label || node.id,
            field: t(field.labelKey),
            reference: ref,
            reason,
          })
        }
      }
    }
  }

  return errors
}

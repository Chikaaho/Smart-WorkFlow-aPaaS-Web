import { i18n } from '@/locales'
/**
 * 图元素双向转换层：后端 ProcessGraph.elements（kind 区分的统一列表）
 * ↔ flow-graph adapter 的 FlowGraphData（节点/边分离模型）。
 *
 * ⚠️ 坐标存储位置是本 Step 前端裁定，不是后端契约：
 *    节点画布坐标存 GraphElement.style.x / style.y（后端 config/style 为不透明
 *    Map 原样透传，后端仅解释 id/kind/type/source/target）。后续 Step 不得把
 *    style.x/style.y 当作后端强制字段。
 *
 * 映射约定（与 Step8 执行契约严格对齐，见 AgentGraphInterpreter 常量）：
 *   · 节点：kind="node"，type ∈ {START, END, LLM, TOOL, CONDITION, …}（可扩展，
 *     未知类型原样透传不崩溃）
 *   · 节点业务配置：FlowGraphNode.data ↔ GraphElement.config
 *       - LLM 节点  config.agentModelConfigId（模型配置 id）
 *       - TOOL 节点 config.toolName（工具白名单 name 精确值）
 *       - LLM/TOOL 节点 config.inputVar / config.outputVar（输入/输出变量名，
 *         留空/缺失 = 默认变量 input，与后端 resolveVarName 宽松语义一致）
 *       - LOOP 节点  config.maxIterations（循环最大迭代次数，Integer ≥1，缺省后端
 *         默认 10；前端仅表达/编辑，不解释循环语义）
 *   · 条件边关键词：GraphElement 的 config.keyword ↔ FlowGraphEdge.label
 *     （画布原生渲染边标签，直接可见；空/缺失 = 默认边，与后端 keywordOf 语义一致）
 *   · 节点/边 id 原样透传（设计器分配，往返不丢失）
 *
 * 本文件只准调用 adapters/flow-graph/index.ts 的导出契约，
 * 禁止绕过防腐层直接 import @vue-flow/core。
 */
import type { FlowGraphData, FlowGraphEdge, FlowGraphNode } from '@/adapters/flow-graph'
import type { GraphElement } from '@/contracts/agent'

/** 后端节点 config 键（与 AgentGraphInterpreter 常量对齐，非训练记忆） */
export const NODE_CONFIG_KEY_MODEL_ID = 'agentModelConfigId'
export const NODE_CONFIG_KEY_TOOL_NAME = 'toolName'
export const NODE_CONFIG_KEY_INPUT_VAR = 'inputVar'
export const NODE_CONFIG_KEY_OUTPUT_VAR = 'outputVar'
export const NODE_CONFIG_KEY_MAX_ITERATIONS = 'maxIterations'
export const NODE_CONFIG_KEY_SYSTEM_PROMPT = 'systemPrompt'
export const NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE = 'userPromptTemplate'
export const EDGE_CONFIG_KEY_KEYWORD = 'keyword'

/** 默认变量名（与后端 AgentGraphInterpreter.DEFAULT_VARIABLE_NAME 对齐） */
export const DEFAULT_VARIABLE_NAME = 'input'

/** 后端节点类型（与 AgentGraphInterpreter 常量对齐） */
export const NODE_TYPE_START = 'START'
export const NODE_TYPE_END = 'END'
export const NODE_TYPE_LLM = 'LLM'
export const NODE_TYPE_TOOL = 'TOOL'
export const NODE_TYPE_CONDITION = 'CONDITION'
export const NODE_TYPE_LOOP = 'LOOP'
export const NODE_TYPE_FORK = 'FORK'
export const NODE_TYPE_JOIN = 'JOIN'

/**
 * 节点类型 → 文案键（仅展示用途，不落库，往返无字段）。
 *
 * 存**键**而不是求值结果：模块加载期求值会把语言固化，之后切换语言不再生效。
 * 取显示名一律走 nodeTypeLabel()（或统一枚举表 enumLabel('AGENT_NODE_TYPE', type)）。
 */
export const NODE_TYPE_LABEL_KEYS: Record<string, string> = {
  [NODE_TYPE_START]: 'agent.nodeStart',
  [NODE_TYPE_END]: 'agent.nodeEnd',
  [NODE_TYPE_LLM]: 'agent.nodeLlm',
  [NODE_TYPE_TOOL]: 'agent.nodeTool',
  [NODE_TYPE_CONDITION]: 'agent.nodeCondition',
  [NODE_TYPE_LOOP]: 'agent.nodeLoop',
  [NODE_TYPE_FORK]: 'agent.nodeFork',
  [NODE_TYPE_JOIN]: 'agent.nodeJoin',
}

/** 节点类型显示名；未登记类型回落为类型本身（不回落为键名）。 */
export function nodeTypeLabel(type: string): string {
  const key = NODE_TYPE_LABEL_KEYS[type]
  return key ? i18n.global.t(key) : type
}

function isNode(el: GraphElement): boolean {
  return el.kind === 'node'
}

function isEdge(el: GraphElement): boolean {
  return el.kind === 'edge'
}

/** elements → FlowGraphData（节点坐标自 style.x/style.y 读取，缺省归零） */
export function elementsToFlowGraphData(elements: GraphElement[]): FlowGraphData {
  const nodes: FlowGraphNode[] = []
  const edges: FlowGraphEdge[] = []

  for (const el of elements ?? []) {
    if (isNode(el)) {
      const style = el.style ?? {}
      const x = typeof style.x === 'number' ? style.x : 0
      const y = typeof style.y === 'number' ? style.y : 0
      nodes.push({
        id: el.id,
        type: el.type,
        position: { x, y },
        data: el.config ? { ...el.config } : undefined,
      })
    } else if (isEdge(el)) {
      const keyword = edgeKeyword(el)
      edges.push({
        id: el.id,
        source: el.source ?? '',
        target: el.target ?? '',
        // 条件边关键词由 FlowGraphEdge.label 承载（画布直接可见）
        label: keyword ?? undefined,
      })
    }
  }
  return { nodes, edges }
}

/** FlowGraphData → elements（节点坐标写回 style.x/style.y，业务配置写回 config） */
export function flowGraphDataToElements(data: FlowGraphData): GraphElement[] {
  const elements: GraphElement[] = []
  const nodes = data.nodes ?? []
  const edges = data.edges ?? []

  for (const node of nodes) {
    const style: Record<string, unknown> = {}
    if (typeof node.position.x === 'number') {
      style.x = node.position.x
    }
    if (typeof node.position.y === 'number') {
      style.y = node.position.y
    }
    elements.push({
      id: node.id,
      kind: 'node',
      type: node.type,
      source: undefined,
      target: undefined,
      config: node.data ? { ...node.data } : undefined,
      style: Object.keys(style).length > 0 ? style : undefined,
    })
  }

  for (const edge of edges) {
    const config: Record<string, unknown> = {}
    // 边关键词仅在有值时写入 config.keyword；空/缺失 = 默认边（后端 keywordOf 语义）
    if (edge.label && edge.label.trim() !== '') {
      config[EDGE_CONFIG_KEY_KEYWORD] = edge.label.trim()
    }
    elements.push({
      id: edge.id,
      kind: 'edge',
      type: undefined,
      source: edge.source,
      target: edge.target,
      config: Object.keys(config).length > 0 ? config : undefined,
      style: undefined,
    })
  }

  return elements
}

/** 读取边条件关键词（与后端 AgentGraphInterpreter.keywordOf 语义一致：空/缺失 = 默认边） */
export function edgeKeyword(edge: GraphElement): string | null {
  const config = edge.config
  if (!config) return null
  const keyword = config[EDGE_CONFIG_KEY_KEYWORD]
  if (typeof keyword !== 'string' || keyword.trim() === '') return null
  return keyword
}

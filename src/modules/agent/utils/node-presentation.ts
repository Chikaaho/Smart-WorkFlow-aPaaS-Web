/**
 * 节点展示元数据（G1-2）：业务节点类型 → 图标/主色/一行配置摘要。
 *
 * 适配层只认中性图标词汇；类型语义留在业务层。摘要是展示用，不落 graph_json。
 */
import type { FlowGraphEdge, FlowGraphNode, FlowNodePresentation } from '@/adapters/flow-graph'
import type { AgentModelConfigOption, AgentToolOption, KnowledgeBase } from '@/contracts/agent'
import { i18n } from '@/locales'
import {
  NODE_CONFIG_KEY_KNOWLEDGE_BASE_ID,
  NODE_CONFIG_KEY_MAX_ITERATIONS,
  NODE_CONFIG_KEY_MODEL_ID,
  NODE_CONFIG_KEY_TOOL_NAME,
  NODE_CONFIG_KEY_TOP_K,
  NODE_CONFIG_KEY_HUMAN_ASSIGNEE_ROLE_CODES,
  NODE_CONFIG_KEY_HUMAN_ASSIGNEE_USER_IDS,
  NODE_CONFIG_KEY_HUMAN_INSTRUCTIONS,
  NODE_CONFIG_KEY_HUMAN_TIMEOUT_SECONDS,
  NODE_CONFIG_KEY_SUBGRAPH_DEF_ID,
  NODE_CONFIG_KEY_SUBGRAPH_DEF_VERSION,
  NODE_TYPE_CONDITION,
  NODE_TYPE_END,
  NODE_TYPE_FORK,
  NODE_TYPE_JOIN,
  NODE_TYPE_KNOWLEDGE,
  NODE_TYPE_LLM,
  NODE_TYPE_LOOP,
  NODE_TYPE_HUMAN,
  NODE_TYPE_START,
  NODE_TYPE_SUBGRAPH,
  NODE_TYPE_TOOL,
} from './graphAdapter'

/** 节点类型 → 中性图标 key（适配层 NodeCard 内置图标词汇） */
export const NODE_TYPE_ICONS: Record<string, string> = {
  [NODE_TYPE_START]: 'play',
  [NODE_TYPE_END]: 'stop',
  [NODE_TYPE_LLM]: 'spark',
  [NODE_TYPE_TOOL]: 'tool',
  [NODE_TYPE_CONDITION]: 'branch',
  [NODE_TYPE_LOOP]: 'loop',
  [NODE_TYPE_FORK]: 'fork',
  [NODE_TYPE_JOIN]: 'join',
  [NODE_TYPE_KNOWLEDGE]: 'book',
  [NODE_TYPE_HUMAN]: 'user',
  [NODE_TYPE_SUBGRAPH]: 'subgraph',
}

/** 节点类型 → 主色（对齐流程设计器视觉：开始/结束绿、智能能力主色、工具橙、条件红） */
export const NODE_TYPE_ACCENTS: Record<string, string> = {
  [NODE_TYPE_START]: '#67c23a',
  [NODE_TYPE_END]: '#67c23a',
  [NODE_TYPE_LLM]: '#7e306b',
  [NODE_TYPE_TOOL]: '#e6a23c',
  [NODE_TYPE_CONDITION]: '#f56c6c',
  [NODE_TYPE_LOOP]: '#909399',
  [NODE_TYPE_FORK]: '#652656',
  [NODE_TYPE_JOIN]: '#652656',
  [NODE_TYPE_KNOWLEDGE]: '#7c3aed',
  [NODE_TYPE_HUMAN]: '#409eff',
  [NODE_TYPE_SUBGRAPH]: '#652656',
}

export interface NodePresentationContext {
  modelOptions: AgentModelConfigOption[]
  toolOptions: AgentToolOption[]
  knowledgeOptions: KnowledgeBase[]
  /** 已发布图（SUBGRAPH 节点展示被调用图名与版本） */
  graphOptions?: Array<{ id: number | string; name: string; defVersion?: number }>
  edges: FlowGraphEdge[]
}

interface OutputParam {
  name?: unknown
  source?: unknown
}

function t(key: string, params?: Record<string, unknown>): string {
  return i18n.global.t(key, params ?? {})
}

/** 节点 data.params / data.outputs 数量摘要（开始/结束节点） */
function paramSummary(node: FlowGraphNode, direction: 'params' | 'outputs'): string {
  const list = node.data?.[direction]
  const count = Array.isArray(list)
    ? list.filter((p) => p && typeof p === 'object' && String((p as OutputParam).name ?? '').trim())
        .length
    : 0
  if (count > 0) {
    return direction === 'params'
      ? t('agent.summaryParams', { count })
      : t('agent.summaryOutputs', { count })
  }
  return direction === 'params' ? t('agent.summaryParamsDefault') : t('agent.summaryOutputsUnset')
}

/** 按节点当前配置计算一行摘要（无可用配置时给「未设置」语义，不伪造） */
export function nodeSummary(node: FlowGraphNode, ctx: NodePresentationContext): string {
  const data = node.data ?? {}
  switch (node.type) {
    case NODE_TYPE_START:
      return paramSummary(node, 'params')
    case NODE_TYPE_END:
      return paramSummary(node, 'outputs')
    case NODE_TYPE_LLM: {
      const modelId = data[NODE_CONFIG_KEY_MODEL_ID]
      const model = ctx.modelOptions.find((m) => String(m.id) === String(modelId))
      return model ? (model.name ?? String(modelId)) : t('agent.summaryModelUnset')
    }
    case NODE_TYPE_TOOL: {
      const toolName = data[NODE_CONFIG_KEY_TOOL_NAME]
      return typeof toolName === 'string' && toolName.trim()
        ? toolName
        : t('agent.summaryToolUnset')
    }
    case NODE_TYPE_CONDITION: {
      const count = ctx.edges.filter((e) => e.source === node.id).length
      return count > 0 ? t('agent.summaryBranches', { count }) : t('agent.summaryBranchesEmpty')
    }
    case NODE_TYPE_LOOP: {
      const max = data[NODE_CONFIG_KEY_MAX_ITERATIONS]
      return typeof max === 'number' && max > 0
        ? t('agent.summaryLoopMax', { count: max })
        : t('agent.summaryLoopDefault')
    }
    case NODE_TYPE_FORK: {
      const count = ctx.edges.filter((e) => e.source === node.id).length
      return t('agent.summaryParallel', { count })
    }
    case NODE_TYPE_JOIN: {
      const count = ctx.edges.filter((e) => e.target === node.id).length
      return t('agent.summaryJoin', { count })
    }
    case NODE_TYPE_KNOWLEDGE: {
      const baseId = data[NODE_CONFIG_KEY_KNOWLEDGE_BASE_ID]
      const base = ctx.knowledgeOptions.find((k) => String(k.id) === String(baseId))
      const topK = data[NODE_CONFIG_KEY_TOP_K]
      const name = base ? (base.name ?? String(baseId)) : t('agent.summaryKnowledgeUnset')
      return typeof topK === 'number' && topK > 0
        ? t('agent.summaryKnowledgeTopK', { name, topK })
        : name
    }
    case NODE_TYPE_HUMAN: {
      const instructions = data[NODE_CONFIG_KEY_HUMAN_INSTRUCTIONS]
      if (typeof instructions === 'string' && instructions.trim()) {
        const firstLine = instructions
          .trim()
          .split(String.fromCharCode(10))[0]
          .replace(String.fromCharCode(13), '')
        return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine
      }
      const users = data[NODE_CONFIG_KEY_HUMAN_ASSIGNEE_USER_IDS]
      const roles = data[NODE_CONFIG_KEY_HUMAN_ASSIGNEE_ROLE_CODES]
      const count =
        (Array.isArray(users) ? users.length : 0) + (Array.isArray(roles) ? roles.length : 0)
      if (count === 0) return t('agent.summaryHumanUnset')
      const timeout = data[NODE_CONFIG_KEY_HUMAN_TIMEOUT_SECONDS]
      return typeof timeout === 'number' && timeout > 0
        ? t('agent.summaryHumanTimeout', { count, seconds: timeout })
        : t('agent.summaryHuman', { count })
    }
    case NODE_TYPE_SUBGRAPH: {
      const defId = data[NODE_CONFIG_KEY_SUBGRAPH_DEF_ID]
      const defVersion = data[NODE_CONFIG_KEY_SUBGRAPH_DEF_VERSION]
      const graph = (ctx.graphOptions ?? []).find((g) => String(g.id) === String(defId))
      if (!graph) return t('agent.summarySubgraphUnset')
      return typeof defVersion === 'number' && defVersion > 0
        ? t('agent.summarySubgraph', { name: graph.name, version: defVersion })
        : graph.name
    }
    default:
      return ''
  }
}

/** 组装节点展示元数据（保留已有 status，供运行态覆盖） */
export function nodePresentation(
  node: FlowGraphNode,
  ctx: NodePresentationContext,
  status?: FlowNodePresentation['status'],
): FlowNodePresentation {
  return {
    icon: NODE_TYPE_ICONS[node.type ?? ''] ?? 'dot',
    accent: NODE_TYPE_ACCENTS[node.type ?? ''] ?? '#909399',
    summary: nodeSummary(node, ctx),
    ...((status ?? node.presentation?.status)
      ? { status: status ?? node.presentation?.status }
      : {}),
  }
}

import { FLOW_ICON_PATHS } from '@/adapters/flow-graph'
import {
  NODE_TYPE_CONDITION,
  NODE_TYPE_END,
  NODE_TYPE_FORK,
  NODE_TYPE_HUMAN,
  NODE_TYPE_JOIN,
  NODE_TYPE_KNOWLEDGE,
  NODE_TYPE_LLM,
  NODE_TYPE_LOOP,
  NODE_TYPE_START,
  NODE_TYPE_SUBGRAPH,
  NODE_TYPE_TOOL,
} from '@/modules/agent/utils/graphAdapter'

/**
 * 图设计器节点面板/插入对话框共用常量（单一数据源）。
 * 面板分组、可插入类型与图标字形供 GraphPalettePanel / GraphInsertNodeDialog 消费。
 */

export const NODE_TYPES = [
  NODE_TYPE_START,
  NODE_TYPE_END,
  NODE_TYPE_LLM,
  NODE_TYPE_TOOL,
  NODE_TYPE_CONDITION,
  NODE_TYPE_LOOP,
  NODE_TYPE_FORK,
  NODE_TYPE_JOIN,
  NODE_TYPE_KNOWLEDGE,
  NODE_TYPE_HUMAN,
  NODE_TYPE_SUBGRAPH,
]

export const PALETTE_GROUPS: Array<{ labelKey: string; types: string[] }> = [
  { labelKey: 'agent.paletteGroupBasic', types: [NODE_TYPE_START, NODE_TYPE_END] },
  {
    labelKey: 'agent.paletteGroupCapability',
    types: [NODE_TYPE_LLM, NODE_TYPE_TOOL, NODE_TYPE_KNOWLEDGE],
  },
  {
    labelKey: 'agent.paletteGroupControl',
    types: [NODE_TYPE_CONDITION, NODE_TYPE_LOOP, NODE_TYPE_FORK, NODE_TYPE_JOIN],
  },
  {
    labelKey: 'agent.paletteGroupInteraction',
    types: [NODE_TYPE_HUMAN, NODE_TYPE_SUBGRAPH],
  },
]

/** 「+」插入可选类型（开始/结束节点不可插入，避免破坏唯一性） */
export const INSERTABLE_TYPES = NODE_TYPES.filter(
  (type) => type !== NODE_TYPE_START && type !== NODE_TYPE_END,
)

/** V1：面板/插入对话框共用图标字形（适配层中性图标词汇） */
export const PALETTE_ICON_PATHS = FLOW_ICON_PATHS

/** 插入对话框按分组展示（剔除开始/结束） */
export const INSERT_GROUPS = PALETTE_GROUPS.map((group) => ({
  labelKey: group.labelKey,
  types: group.types.filter((type) => INSERTABLE_TYPES.includes(type)),
})).filter((group) => group.types.length > 0)

/** G1-8 单节点运行支持的节点类型（LLM/工具/知识检索） */
export const RUNNABLE_NODE_TYPES = [NODE_TYPE_LLM, NODE_TYPE_TOOL, NODE_TYPE_KNOWLEDGE]

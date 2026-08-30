/**
 * GraphDesigner 节点属性面板注册表（扩展插槽 · 单一数据源）。
 *
 * GraphDesigner.vue 属性面板按节点类型查这张表动态挂载面板组件（`<component :is>`），
 * **任何消费方禁止写死 8 类的 if/switch**。新增一类节点 = 往 `NODE_PANEL_REGISTRY`
 * 加一条描述符（或调用 `registerNodePanelDescriptor`），消费方零改。
 *
 * 每条描述符声明三样：
 *  1. 节点类型判别子（type，对齐 graphAdapter 的 NODE_TYPE_* 常量）；
 *  2. 节点类型中文名（label，空态说明等面板内展示用）；
 *  3. 属性面板组件（component，props 收 NodePanelProps，交互事件经 emit 上行到
 *     GraphDesigner 统一处理——模型配置/变量名写回、maxIterations 校验、出边关键词、
 *     删边等既有语义全部保留在消费方）。
 *
 * 设计对齐先例 `modules/form/designer/field-types.ts` 的 FIELD_TYPE_REGISTRY：
 * 描述符 + 查找函数 + 消费方 `<component :is>` 动态挂载。
 */
import type { Component } from 'vue'
import type { FlowGraphEdge, FlowGraphNode } from '@/adapters/flow-graph'
import type { AgentModelConfigOption, AgentToolOption } from '@/contracts/agent'
import {
  NODE_TYPE_CONDITION,
  NODE_TYPE_END,
  NODE_TYPE_FORK,
  NODE_TYPE_JOIN,
  NODE_TYPE_LLM,
  NODE_TYPE_LOOP,
  NODE_TYPE_START,
  NODE_TYPE_TOOL,
} from '@/modules/agent/utils/graphAdapter'
import EmptyPanel from './EmptyPanel.vue'
import LlmPanel from './LlmPanel.vue'
import ToolPanel from './ToolPanel.vue'
import LoopPanel from './LoopPanel.vue'
import ForkPanel from './ForkPanel.vue'
import JoinPanel from './JoinPanel.vue'
import ConditionPanel from './ConditionPanel.vue'

/** 属性面板统一入参（各面板按需消费；交互经 emit 上行，面板自身零副作用）。 */
export interface NodePanelProps {
  /** 当前选中节点（画布节点，含业务配置 data）。 */
  node: FlowGraphNode
  /** LLM 模型配置选项（模型下拉数据源）。 */
  modelOptions: AgentModelConfigOption[]
  /** TOOL 工具选项（internal/external 合并列表）。 */
  toolOptions: AgentToolOption[]
  /** CONDITION 节点出边（条件分支关键词编辑入口）。 */
  conditionOutEdges: FlowGraphEdge[]
  /** 出边显示名（起点 label → 终点 label）。 */
  edgeDisplayName: (edge: FlowGraphEdge) => string
  /** 节点类型中文名（空态说明等展示用）。 */
  label: string
}

export interface NodePanelDescriptor {
  /** 节点类型判别子（对齐 graphAdapter NODE_TYPE_* 常量，注册表不限定枚举以保扩展性）。 */
  type: string
  /** 节点类型中文名。 */
  label: string
  /** 属性面板组件（NodePanelProps 入参 + 类型化 emits，见各面板）。 */
  component: Component
}

export const NODE_PANEL_REGISTRY: NodePanelDescriptor[] = [
  { type: NODE_TYPE_START, label: '开始', component: EmptyPanel },
  { type: NODE_TYPE_END, label: '结束', component: EmptyPanel },
  { type: NODE_TYPE_LLM, label: 'LLM 调用', component: LlmPanel },
  { type: NODE_TYPE_TOOL, label: '工具调用', component: ToolPanel },
  { type: NODE_TYPE_CONDITION, label: '条件分支', component: ConditionPanel },
  { type: NODE_TYPE_LOOP, label: '循环', component: LoopPanel },
  { type: NODE_TYPE_FORK, label: '并行分支', component: ForkPanel },
  { type: NODE_TYPE_JOIN, label: '汇合', component: JoinPanel },
]

/** 按 type 取描述符；取不到返回 undefined（消费方兜底：无面板渲染）。 */
export function getNodePanelDescriptor(type: string): NodePanelDescriptor | undefined {
  return NODE_PANEL_REGISTRY.find((d) => d.type === type)
}

/**
 * 注册新节点面板（编译期静态注册位；同 type 覆盖式注册，幂等）。
 * 运行时热插拔（DB/OSGi 驱动）在方向文档中明确为非目标——此函数仅为
 * 静态注册与测试型注册（可插拔性证明）提供入口。
 */
export function registerNodePanelDescriptor(descriptor: NodePanelDescriptor): void {
  const idx = NODE_PANEL_REGISTRY.findIndex((d) => d.type === descriptor.type)
  if (idx >= 0) NODE_PANEL_REGISTRY.splice(idx, 1, descriptor)
  else NODE_PANEL_REGISTRY.push(descriptor)
}

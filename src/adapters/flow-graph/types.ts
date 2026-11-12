/**
 * flow-graph 适配层对外契约（业务层唯一可消费的类型与常量）。
 * 自定义节点/连线组件也从这里取展示类型，避免与 index.ts 循环引用。
 */

/** 节点运行状态（G1-7：画布节点状态色） */
export type FlowNodeStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped' | 'waiting'

/** 仅展示用的渲染元数据：不落业务配置，由业务层按当前状态计算后传入 */
export interface FlowNodePresentation {
  /** 中性图标词汇 key（适配层内置图标集合，业务层负责类型→key 映射） */
  icon?: string
  /** 主色（CSS color 值，业务层按节点类型/状态映射） */
  accent?: string
  /** 一行关键配置摘要（如模型名、分支数、知识库名） */
  summary?: string
  /** 运行状态色 */
  status?: FlowNodeStatus
}

/**
 * vue-flow 节点 data 中的展示元数据保留键。
 * 适配层在导出/事件回传时剥离，业务层 config 不受污染。
 */
export const FLOW_PRESENTATION_KEY = '__swFlowPresentation'

export interface FlowGraphNode {
  id: string
  type?: string
  label?: string
  position: { x: number; y: number }
  data?: Record<string, unknown>
  /** 展示元数据（可选；不进入业务配置） */
  presentation?: FlowNodePresentation
}

export interface FlowGraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface FlowGraphData {
  nodes: FlowGraphNode[]
  edges: FlowGraphEdge[]
}

/** 「+」插入目标：节点后插入或连线中插入 */
export type FlowInsertTarget = { kind: 'node'; id: string } | { kind: 'edge'; id: string }

export interface FlowGraphEvents {
  onNodeClick?: (node: FlowGraphNode) => void
  onEdgeClick?: (edge: FlowGraphEdge) => void
  onPaneClick?: () => void
  onNodeDragStop?: (node: FlowGraphNode) => void
  onEdgeCreate?: (edge: FlowGraphEdge) => void
  onGraphChange?: (data: FlowGraphData) => void
  /** 节点/连线中点「+」点击（业务层弹类型选择并插入） */
  onInsertAfter?: (target: FlowInsertTarget) => void
  /** 视图缩放变化（缩放栏百分比显示） */
  onViewportChange?: (zoom: number) => void
}

export interface FlowGraphFitViewOptions {
  padding?: number
  duration?: number
}

/** 命令式实例：结构变更不再销毁重挂载（G1-1） */
export interface FlowGraphInstance {
  exportGraph(): FlowGraphData
  /** 整体替换节点/边（保持画布实例与视口） */
  setData(data: FlowGraphData): void
  addNode(node: FlowGraphNode): void
  updateNode(node: FlowGraphNode): void
  removeNode(id: string): void
  addEdge(edge: FlowGraphEdge): void
  updateEdge(edge: FlowGraphEdge): void
  removeEdge(id: string): void
  fitView(options?: FlowGraphFitViewOptions): void
  zoomIn(): void
  zoomOut(): void
  setZoom(zoom: number): void
  getZoom(): number
  /** 屏幕坐标（如拖放事件的 clientX/clientY）→ 画布坐标 */
  screenToGraphPoint(clientX: number, clientY: number): { x: number; y: number }
  destroy(): void
}

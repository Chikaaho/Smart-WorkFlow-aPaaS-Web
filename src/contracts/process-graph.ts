/**
 * ProcessGraph —— 自研流程设计器单一图契约（I3 §4.1）。
 *
 * 与后端 `sw-bpm-api ProcessGraph` 同形；前端不得另建平行图模型。
 * 坐标、折点与画布信息是该契约的一部分（contractVersion ≥ 2）；
 * 历史图缺坐标时经确定性兼容布局还原图形并标明兼容来源。
 */

export type ProcessGraphElementKind = 'node' | 'edge'

export interface ProcessGraphWaypoint {
  x: number
  y: number
}

export interface ProcessGraphElement {
  id: string
  kind: ProcessGraphElementKind
  /** 节点类型（START/END/APPROVAL/CONSENSUS/…），边为 undefined。 */
  type?: string
  /** 边起点节点 id。 */
  source?: string
  /** 边终点节点 id。 */
  target?: string
  config?: Record<string, unknown>
  /** 旧版遗留 opaque 样式（坐标可能藏在这里）。 */
  style?: Record<string, unknown>
  /** 节点画布 X/I3 显式契约。 */
  x?: number
  y?: number
  /** 边折点。 */
  waypoints?: ProcessGraphWaypoint[]
}

export interface ProcessGraphDocument {
  processKey: string
  name: string
  formKey: string
  version?: number
  /** 2 = 第一方设计器显式坐标契约；缺省 = 旧版遗留图。 */
  contractVersion?: number
  elements: ProcessGraphElement[]
  canvas?: Record<string, unknown>
}

// ─── 实例轨迹状态（§4.1：当前/已完成/未经过/取消/失败） ───

export type ProcessNodeRuntimeState =
  | 'current' // 当前
  | 'completed' // 已完成
  | 'passedOver' // 未经过（路径未走）
  | 'cancelled' // 取消
  | 'failed' // 失败
  | 'idle' // 定义查看（无运行态）

export interface ProcessTraceInput {
  /** 当前活跃节点 id。 */
  activeNodeIds: string[]
  /** 已完成节点 id。 */
  completedNodeIds: string[]
}

export const NODE_RUNTIME_STATE_CLASS: Record<ProcessNodeRuntimeState, string> = {
  current: 'pg-state-current',
  completed: 'pg-state-completed',
  passedOver: 'pg-state-passed-over',
  cancelled: 'pg-state-cancelled',
  failed: 'pg-state-failed',
  idle: '',
}

export const NODE_RUNTIME_STATE_LABEL: Record<ProcessNodeRuntimeState, string> = {
  current: '当前节点',
  completed: '已完成',
  passedOver: '未经过',
  cancelled: '已取消',
  failed: '失败',
  idle: '未运行',
}

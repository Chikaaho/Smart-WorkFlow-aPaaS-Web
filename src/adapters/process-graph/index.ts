/**
 * process-graph —— 第一方流程图渲染/设计内核（I3 §4.1—§4.2）。
 *
 * 原生 SVG/几何 API 只允许在本文件内出现；业务层只消费下方导出的我方契约。
 * 是单一权威：设计页、后端 ProcessGraph、定义查看与实例轨迹查看共用同一份图模型。
 * 第三方流程图依赖及其 adapter 已完整退出（§4.2 dependency exit），本文件即其替代渲染内核。
 */
import type {
  ProcessGraphDocument,
  ProcessGraphElement,
  ProcessTraceInput,
  ProcessNodeRuntimeState,
  ProcessGraphWaypoint,
} from '@/contracts/process-graph'

/* ------------------------------------------------------------------ */
/* 常量                                                                 */
/* ------------------------------------------------------------------ */

export const NODE_WIDTH = 160
export const NODE_HEIGHT = 56
export const EDGE_CURVE_HEIGHT = 40

/* ------------------------------------------------------------------ */
/* 类型                                                                 */
/* ------------------------------------------------------------------ */

export interface PositionedNode {
  id: string
  type: string
  label: string
  x: number // 中心点
  y: number
  /** 坐标来源：explicit = 图内显式契约；legacy = style 回读；inferred = 兼容布局。 */
  coordinateSource: 'explicit' | 'legacy' | 'inferred'
  config: Record<string, unknown>
}

export interface PositionedEdge {
  id: string
  sourceId: string
  targetId: string
  /** SVG 折线路径 d 属性（起点/终点落节点中心，渲染层再裁剪到节点边缘）。 */
  path: string
  waypoints: ProcessGraphWaypoint[]
  config: Record<string, unknown>
}

export interface RenderSpec {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  /** 视口适配提示（bbox）。 */
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** 历史图缺坐标时返回 true；调用方需展示「兼容布局」标记。 */
  compatibilityLayout: boolean
}

/* ------------------------------------------------------------------ */
/* 工具                                                                 */
/* ------------------------------------------------------------------ */

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** 稳定字符串哈希（用于确定性兼容布局，禁止随机漂移）。 */
function stableHash(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** 读取单元素坐标：显式 x/y → style.x/y → undefined。 */
function elementCoordinate(element: ProcessGraphElement): {
  x?: number
  y?: number
  source: 'explicit' | 'legacy' | 'none'
} {
  const explicitX = numberOrUndefined(element.x)
  const explicitY = numberOrUndefined(element.y)
  if (explicitX !== undefined || explicitY !== undefined) {
    return {
      x: explicitX ?? 0,
      y: explicitY ?? 0,
      source: explicitX !== undefined && explicitY !== undefined ? 'explicit' : 'legacy',
    }
  }
  const style = element.style ?? {}
  const legacyX = numberOrUndefined(style.x)
  const legacyY = numberOrUndefined(style.y)
  if (legacyX !== undefined || legacyY !== undefined) {
    return { x: legacyX ?? 0, y: legacyY ?? 0, source: 'legacy' }
  }
  return { source: 'none' }
}

/* ------------------------------------------------------------------ */
/* 归一化（图 → 视图坐标）                                              */
/* ------------------------------------------------------------------ */

/**
 * 归一图坐标并生成渲染规格。
 * - 显式坐标优先（I3 契约）；
 * - 旧图 style.x/y 回读（legacy）；
 * - 全缺坐标的元素按节点 ID 确定性布局（同图同输入 → 同布局，不因数组顺序漂移）。
 */
export function normalizeGraph(graph: ProcessGraphDocument): RenderSpec {
  const elements = graph.elements ?? []
  const nodes = elements.filter((e) => e.kind === 'node')
  const edges = elements.filter((e) => e.kind === 'edge')

  const resolved = new Map<
    string,
    { x: number; y: number; source: PositionedNode['coordinateSource'] }
  >()
  let compatibilityLayout = false

  for (const node of nodes) {
    const coordinate = elementCoordinate(node)
    if (coordinate.source === 'none') {
      // 确定性兼容布局：按 ID 哈希落 4 列网格，同输入同输出
      const hash = stableHash(node.id)
      resolved.set(node.id, {
        x: 140 + (hash % 4) * 220,
        y: 80 + (Math.floor(hash / 4) % 6) * 110,
        source: 'inferred',
      })
      compatibilityLayout = true
    } else {
      resolved.set(node.id, {
        x: coordinate.x ?? 0,
        y: coordinate.y ?? 0,
        source: coordinate.source === 'legacy' ? 'legacy' : 'explicit',
      })
    }
  }

  // 无任何显式坐标的整图（包括部分推断）都提示兼容来源
  if (compatibilityLayout || resolved.size === 0) {
    compatibilityLayout = true
  }

  const positionedNodes: PositionedNode[] = nodes.map((node) => {
    const coordinate = resolved.get(node.id) ?? { x: 0, y: 0, source: 'inferred' as const }
    return {
      id: node.id,
      type: node.type ?? 'UNKNOWN',
      label:
        (typeof node.config?.name === 'string' ? node.config.name : undefined) ??
        node.type ??
        node.id,
      x: coordinate.x,
      y: coordinate.y,
      coordinateSource: coordinate.source,
      config: node.config ?? {},
    }
  })

  const nodeById = new Map(positionedNodes.map((n) => [n.id, n] as const))

  const positionedEdges: PositionedEdge[] = edges
    .map((edge) => makePositionedEdge(edge, nodeById))
    .filter((edge): edge is PositionedEdge => edge != null)

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    bounds: graphBounds(positionedNodes),
    compatibilityLayout,
  }
}

function makePositionedEdge(
  edge: ProcessGraphElement,
  nodeById: Map<string, PositionedNode>,
): PositionedEdge | null {
  if (!edge.source || !edge.target) return null
  const source = nodeById.get(edge.source)
  const target = nodeById.get(edge.target)
  if (!source || !target) return null
  const waypoints = edge.waypoints ?? []
  const path = buildEdgePath(source, target, waypoints)
  return {
    id: edge.id,
    sourceId: edge.source,
    targetId: edge.target,
    path,
    waypoints,
    config: edge.config ?? {},
  }
}

/** 相邻/共用节点中心 → SVG path（M L 或先横后竖肘线）。 */
export function buildEdgePath(
  source: Pick<PositionedNode, 'x' | 'y'>,
  target: Pick<PositionedNode, 'x' | 'y'>,
  waypoints: ProcessGraphWaypoint[],
): string {
  const points = [{ x: source.x, y: source.y }, ...waypoints, { x: target.x, y: target.y }]
  if (points.length < 2) return ''
  return points.map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

/** 计算所有节点的外包盒（含节点尺寸），供 fitViewport 定位。 */
export function graphBounds(nodes: PositionedNode[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: NODE_WIDTH, maxY: NODE_HEIGHT }
  }
  let minX = Number.MAX_SAFE_INTEGER
  let minY = Number.MAX_SAFE_INTEGER
  let maxX = Number.MIN_SAFE_INTEGER
  let maxY = Number.MIN_SAFE_INTEGER
  for (const node of nodes) {
    minX = Math.min(minX, node.x - NODE_WIDTH / 2)
    maxX = Math.max(maxX, node.x + NODE_WIDTH / 2)
    minY = Math.min(minY, node.y - NODE_HEIGHT / 2)
    maxY = Math.max(maxY, node.y + NODE_HEIGHT / 2)
  }
  return { minX, minY, maxX, maxY }
}

/* ------------------------------------------------------------------ */
/* 运行态映射                                                           */
/* ------------------------------------------------------------------ */

/**
 * 映射节点运行态：
 * - 活跃 → current
 * - 已完成（endTime 非空）→ completed
 * - 取消/失败以 ID 前缀判定（实例详情流注入）
 * - 其余节点/边 → passedOver（路径未经过）
 */
export function resolveRuntimeState(
  element: { id: string; kind: 'node' | 'edge' },
  trace: ProcessTraceInput | null,
): ProcessNodeRuntimeState {
  if (!trace) return 'idle'
  if (trace.activeNodeIds.includes(element.id)) return 'current'
  if (trace.completedNodeIds.includes(element.id)) return 'completed'
  return 'passedOver'
}

/* ------------------------------------------------------------------ */
/* 设计内核（DesignerModel）                                            */
/* ------------------------------------------------------------------ */

export interface DesignerState {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  selection: string | null
  /** 未保存脏标记。 */
  dirty: boolean
}

/** 设计器历史栈深度。 */
const MAX_HISTORY = 30

export interface DesignerModel {
  state(): DesignerState
  /** 事件订阅（每次变更后触发；轻量订阅者基于快照渲染）。 */
  subscribe(listener: () => void): () => void
  addNode(type: string, label: string, x: number, y: number): string
  moveNode(id: string, x: number, y: number): void
  connect(sourceId: string, targetId: string): string | null
  removeSelection(): void
  select(id: string | null): void
  updateNodeConfig(id: string, patch: Record<string, unknown>): void
  setEdgeWaypoints(id: string, waypoints: ProcessGraphWaypoint[]): void
  undo(): void
  canUndo(): boolean
  serialize(): ProcessGraphDocument
}

export function createDesignerModel(graph: ProcessGraphDocument): DesignerModel {
  const normalized = normalizeGraph(graph)
  let current: DesignerState = {
    nodes: normalized.nodes.map((node) => ({ ...node, config: { ...node.config } })),
    edges: normalized.edges.map((edge) => ({ ...edge, config: { ...edge.config } })),
    selection: null,
    dirty: false,
  }
  const history: DesignerState[] = []
  const subscribers = new Set<() => void>()

  function pushHistory() {
    history.push(cloneState(current))
    if (history.length > MAX_HISTORY) history.shift()
  }

  function cloneState(input: DesignerState): DesignerState {
    return {
      nodes: input.nodes.map((node) => ({ ...node, config: { ...node.config } })),
      edges: input.edges.map((edge) => ({ ...edge, config: { ...edge.config } })),
      selection: input.selection,
      dirty: input.dirty,
    }
  }

  function emit() {
    for (const subscriber of subscribers) subscriber()
  }

  function select(id: string | null) {
    current = { ...current, selection: id }
    emit()
  }

  function nextId(prefix: string): string {
    const existing = new Set([...current.nodes, ...current.edges].map((e) => e.id))
    for (let i = 1; ; i++) {
      const candidate = `${prefix}_${i}`
      if (!existing.has(candidate)) return candidate
    }
  }

  return {
    state: () => current,
    subscribe(listener) {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
    addNode(type, label, x, y) {
      pushHistory()
      const id = nextId('node')
      current = {
        ...current,
        nodes: [
          ...current.nodes,
          {
            id,
            type,
            label,
            x,
            y,
            coordinateSource: 'explicit',
            config: { name: label },
          },
        ],
        dirty: true,
      }
      emit()
      return id
    },
    moveNode(id, x, y) {
      const nodes: PositionedNode[] = current.nodes.map((node) =>
        node.id === id ? { ...node, x, y, coordinateSource: 'explicit' as const } : node,
      )
      if (nodes.some((node, index) => node !== current.nodes[index])) {
        const byId = new Map(nodes.map((node) => [node.id, node] as const))
        const edges: PositionedEdge[] = current.edges.map((edge) => {
          const touches = edge.sourceId === id || edge.targetId === id
          if (!touches) return edge
          const source = byId.get(edge.sourceId)
          const target = byId.get(edge.targetId)
          return source && target
            ? { ...edge, path: buildEdgePath(source, target, edge.waypoints) }
            : edge
        })
        current = { ...current, nodes, edges, dirty: true }
      }
      emit()
    },
    connect(sourceId, targetId) {
      if (!sourceId || !targetId || sourceId === targetId) return null
      const exists = current.edges.some(
        (edge) =>
          (edge.sourceId === sourceId && edge.targetId === targetId) ||
          (edge.sourceId === targetId && edge.targetId === sourceId),
      )
      if (exists) return null
      pushHistory()
      const byId = new Map(current.nodes.map((node) => [node.id, node] as const))
      const source = byId.get(sourceId)
      const target = byId.get(targetId)
      if (!source || !target) return null
      const edgeId = nextId('edge')
      const edge: PositionedEdge = {
        id: edgeId,
        sourceId,
        targetId,
        path: buildEdgePath(source, target, []),
        waypoints: [],
        config: {},
      }
      current = { ...current, edges: [...current.edges, edge], dirty: true }
      emit()
      return edgeId
    },
    removeSelection() {
      if (!current.selection) return
      pushHistory()
      if (current.selection.startsWith('edge')) {
        current = {
          ...current,
          edges: current.edges.filter((edge) => edge.id !== current.selection),
          selection: null,
          dirty: true,
        }
      } else {
        const removedId = current.selection
        current = {
          ...current,
          nodes: current.nodes.filter((node) => node.id !== removedId),
          edges: current.edges.filter(
            (edge) => edge.sourceId !== removedId && edge.targetId !== removedId,
          ),
          selection: null,
          dirty: true,
        }
      }
      emit()
    },
    select,
    updateNodeConfig(id, patch) {
      current = {
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === id ? { ...node, config: { ...node.config, ...patch } } : node,
        ),
        dirty: true,
      }
      emit()
    },
    setEdgeWaypoints(id, waypoints) {
      const byId = new Map(current.nodes.map((node) => [node.id, node] as const))
      current = {
        ...current,
        edges: current.edges.map((edge) =>
          edge.id === id
            ? {
                ...edge,
                waypoints,
                path: (() => {
                  const source = byId.get(edge.sourceId)
                  const target = byId.get(edge.targetId)
                  return source && target ? buildEdgePath(source, target, waypoints) : edge.path
                })(),
              }
            : edge,
        ),
        dirty: true,
      }
      emit()
    },
    undo() {
      const previous = history.pop()
      if (!previous) return
      current = { ...previous }
      emit()
    },
    canUndo: () => history.length > 0,
    serialize() {
      const nodeElements: ProcessGraphElement[] = current.nodes.map((node) => ({
        id: node.id,
        kind: 'node',
        type: node.type,
        x: node.x,
        y: node.y,
        config: { ...node.config },
        style: {},
      }))
      const edgeElements: ProcessGraphElement[] = current.edges.map((edge) => ({
        id: edge.id,
        kind: 'edge',
        source: edge.sourceId,
        target: edge.targetId,
        config: { ...edge.config },
        waypoints: edge.waypoints.length ? edge.waypoints : undefined,
      }))
      return {
        processKey: graph.processKey,
        name: graph.name,
        formKey: graph.formKey,
        version: graph.version,
        contractVersion: 2,
        elements: [...nodeElements, ...edgeElements],
        canvas: graph.canvas ?? {},
      }
    },
  }
}

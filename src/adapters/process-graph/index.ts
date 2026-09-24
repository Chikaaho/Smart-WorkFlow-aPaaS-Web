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

/** 设计（节点09）：流程设计器节点盒 152×46。 */
export const DESIGNER_NODE_WIDTH = 152
export const DESIGNER_NODE_HEIGHT = 46
/** 设计（节点19）：只读图节点盒 158×48。 */
export const GRAPH_NODE_WIDTH = 158
export const GRAPH_NODE_HEIGHT = 48
/** 兼容别名（历史调用方/测试沿用旧常量名）。 */
export const NODE_WIDTH = DESIGNER_NODE_WIDTH
export const NODE_HEIGHT = DESIGNER_NODE_HEIGHT
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
export function normalizeGraph(
  graph: ProcessGraphDocument,
  nodeSize: { width: number; height: number } = {
    width: DESIGNER_NODE_WIDTH,
    height: DESIGNER_NODE_HEIGHT,
  },
  gatewayRadius: number = Math.min(nodeSize.width, nodeSize.height) / 2,
): RenderSpec {
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
    .map((edge) => makePositionedEdge(edge, nodeById, nodeSize, gatewayRadius))
    .filter((edge): edge is PositionedEdge => edge != null)

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    bounds: graphBounds(positionedNodes, nodeSize.width, nodeSize.height),
    compatibilityLayout,
  }
}

function makePositionedEdge(
  edge: ProcessGraphElement,
  nodeById: Map<string, PositionedNode>,
  nodeSize: { width: number; height: number },
  gatewayRadius: number,
): PositionedEdge | null {
  if (!edge.source || !edge.target) return null
  const source = nodeById.get(edge.source)
  const target = nodeById.get(edge.target)
  if (!source || !target) return null
  const waypoints = edge.waypoints ?? []
  const [start, end] = resolveEdgeEnds(edge, source, target, nodeSize, gatewayRadius)
  const path = buildEdgePath(start, end, waypoints)
  return {
    id: edge.id,
    sourceId: edge.source,
    targetId: edge.target,
    path,
    waypoints,
    config: edge.config ?? {},
  }
}

/** 读取 config 中的显式锚点 [x,y]（图内绝对坐标）；非法值返回 null。 */
function configAnchor(value: unknown): { x: number; y: number } | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const x = numberOrUndefined(value[0])
  const y = numberOrUndefined(value[1])
  return x !== undefined && y !== undefined ? { x, y } : null
}

/**
 * 边端点解析：config.sourceAnchor/targetAnchor 显式锚点优先（设计稿精确落点，
 * 如网关扇出汇入节点左下角、汇聚边入底边中点），否则按端口规则计算。
 */
function resolveEdgeEnds(
  edge: Pick<ProcessGraphElement, 'config'>,
  source: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  target: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
  gatewayRadius: number,
): [{ x: number; y: number }, { x: number; y: number }] {
  const config = (edge.config ?? {}) as Record<string, unknown>
  const start = configAnchor(config.sourceAnchor)
  const end = configAnchor(config.targetAnchor)
  if (start && end) return [start, end]
  return edgeEndpoints(source, target, nodeSize, gatewayRadius)
}

/** 端口坐标：水平边取左右缘中心，垂直边取上下缘中心；网关取菱形顶点（半径与渲染的菱形一致）。 */
function portPoint(
  node: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  side: 'left' | 'right' | 'top' | 'bottom',
  nodeSize: { width: number; height: number },
  gatewayRadius: number,
): { x: number; y: number } {
  if (node.type === 'GATEWAY') {
    const r = gatewayRadius
    if (side === 'left') return { x: node.x - r, y: node.y }
    if (side === 'right') return { x: node.x + r, y: node.y }
    if (side === 'top') return { x: node.x, y: node.y - r }
    return { x: node.x, y: node.y + r }
  }
  if (side === 'left') return { x: node.x - nodeSize.width / 2, y: node.y }
  if (side === 'right') return { x: node.x + nodeSize.width / 2, y: node.y }
  if (side === 'top') return { x: node.x, y: node.y - nodeSize.height / 2 }
  return { x: node.x, y: node.y + nodeSize.height / 2 }
}

function edgeEndpoints(
  source: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  target: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
  gatewayRadius = Math.min(nodeSize.width, nodeSize.height) / 2,
): [{ x: number; y: number }, { x: number; y: number }] {
  const dx = target.x - source.x
  const dy = target.y - source.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return [
      portPoint(source, dx >= 0 ? 'right' : 'left', nodeSize, gatewayRadius),
      portPoint(target, dx >= 0 ? 'left' : 'right', nodeSize, gatewayRadius),
    ]
  }
  return [
    portPoint(source, dy >= 0 ? 'bottom' : 'top', nodeSize, gatewayRadius),
    portPoint(target, dy >= 0 ? 'top' : 'bottom', nodeSize, gatewayRadius),
  ]
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
export function graphBounds(
  nodes: PositionedNode[],
  nodeWidth: number = DESIGNER_NODE_WIDTH,
  nodeHeight: number = DESIGNER_NODE_HEIGHT,
): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: nodeWidth, maxY: nodeHeight }
  }
  let minX = Number.MAX_SAFE_INTEGER
  let minY = Number.MAX_SAFE_INTEGER
  let maxX = Number.MIN_SAFE_INTEGER
  let maxY = Number.MIN_SAFE_INTEGER
  for (const node of nodes) {
    minX = Math.min(minX, node.x - nodeWidth / 2)
    maxX = Math.max(maxX, node.x + nodeWidth / 2)
    minY = Math.min(minY, node.y - nodeHeight / 2)
    maxY = Math.max(maxY, node.y + nodeHeight / 2)
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
  /** V011-BUG-020：在既有连线中间插入节点（原连线拆除，换为 源→新节点→目标 两条）。 */
  insertNodeOnEdge(edgeId: string, type: string, label: string, x: number, y: number): string | null
  moveNode(id: string, x: number, y: number): void
  connect(sourceId: string, targetId: string): string | null
  removeSelection(): void
  select(id: string | null): void
  updateNodeConfig(id: string, patch: Record<string, unknown>): void
  setEdgeWaypoints(id: string, waypoints: ProcessGraphWaypoint[]): void
  /** V011-BUG-025：拖动端点改接其他节点（自环/重复边校验；空放回退由调用方处理）。 */
  setEdgeEndpoint(id: string, which: 'source' | 'target', nodeId: string): string | null
  undo(): void
  canUndo(): boolean
  serialize(): ProcessGraphDocument
}

export function createDesignerModel(
  graph: ProcessGraphDocument,
  nodeSize: { width: number; height: number } = {
    width: DESIGNER_NODE_WIDTH,
    height: DESIGNER_NODE_HEIGHT,
  },
  gatewayRadius: number = Math.min(nodeSize.width, nodeSize.height) / 2,
): DesignerModel {
  const normalized = normalizeGraph(graph, nodeSize, gatewayRadius)
  const designerNodeSize = nodeSize
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
          if (!source || !target) return edge
          const [start, end] = resolveEdgeEnds(
            edge,
            source,
            target,
            designerNodeSize,
            gatewayRadius,
          )
          return { ...edge, path: buildEdgePath(start, end, edge.waypoints) }
        })
        current = { ...current, nodes, edges, dirty: true }
      }
      emit()
    },
    insertNodeOnEdge(edgeId, type, label, x, y) {
      const edge = current.edges.find((candidate) => candidate.id === edgeId)
      if (!edge) return null
      const source = current.nodes.find((node) => node.id === edge.sourceId)
      const target = current.nodes.find((node) => node.id === edge.targetId)
      if (!source || !target) return null
      pushHistory()
      const nodeId = nextId('node')
      const inserted: PositionedNode = {
        id: nodeId,
        type,
        label,
        x,
        y,
        coordinateSource: 'explicit',
        config: { name: label },
      }
      const chainEdge = (from: PositionedNode, to: PositionedNode): PositionedEdge => {
        const [start, end] = edgeEndpoints(from, to, designerNodeSize, gatewayRadius)
        return {
          id: nextId('edge'),
          sourceId: from.id,
          targetId: to.id,
          path: buildEdgePath(start, end, []),
          waypoints: [],
          config: {},
        }
      }
      current = {
        ...current,
        nodes: [...current.nodes, inserted],
        edges: [
          ...current.edges.filter((candidate) => candidate.id !== edgeId),
          chainEdge(source, inserted),
          chainEdge(inserted, target),
        ],
        dirty: true,
      }
      emit()
      return nodeId
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
        path: (() => {
          const [start, end] = edgeEndpoints(source, target, designerNodeSize, gatewayRadius)
          return buildEdgePath(start, end, [])
        })(),
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
                  if (!source || !target) return edge.path
                  const [start, end] = resolveEdgeEnds(
                    edge,
                    source,
                    target,
                    designerNodeSize,
                    gatewayRadius,
                  )
                  return buildEdgePath(start, end, waypoints)
                })(),
              }
            : edge,
        ),
        dirty: true,
      }
      emit()
    },
    /** V011-BUG-025：端点改接。校验：目标存在、不接向对端（自环禁止）、
     * 改接后不得与既有边重复（双向判定）；改接侧显式锚点失效（config 清除，
     * 走几何端口规则重算）；既有 waypoints 保留。 */
    setEdgeEndpoint(edgeId, which, nodeId) {
      const edge = current.edges.find((candidate) => candidate.id === edgeId)
      if (!edge) return null
      const otherEnd = which === 'source' ? edge.targetId : edge.sourceId
      if (nodeId === otherEnd) return null
      const byId = new Map(current.nodes.map((node) => [node.id, node] as const))
      const node = byId.get(nodeId)
      if (!node) return null
      const exists = current.edges.some(
        (candidate) =>
          candidate.id !== edgeId &&
          ((candidate.sourceId === nodeId && candidate.targetId === otherEnd) ||
            (candidate.sourceId === otherEnd && candidate.targetId === nodeId)),
      )
      if (exists) return null
      pushHistory()
      const config = { ...edge.config }
      delete config[which === 'source' ? 'sourceAnchor' : 'targetAnchor']
      const nextEdge = {
        ...edge,
        sourceId: which === 'source' ? nodeId : edge.sourceId,
        targetId: which === 'target' ? nodeId : edge.targetId,
        config,
      }
      const source = byId.get(nextEdge.sourceId)
      const target = byId.get(nextEdge.targetId)
      current = {
        ...current,
        edges: current.edges.map((candidate) =>
          candidate.id === edgeId
            ? {
                ...nextEdge,
                path: (() => {
                  if (!source || !target) return candidate.path
                  const [start, end] = resolveEdgeEnds(
                    nextEdge,
                    source,
                    target,
                    designerNodeSize,
                    gatewayRadius,
                  )
                  return buildEdgePath(start, end, nextEdge.waypoints)
                })(),
              }
            : candidate,
        ),
        dirty: true,
      }
      emit()
      return edgeId
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

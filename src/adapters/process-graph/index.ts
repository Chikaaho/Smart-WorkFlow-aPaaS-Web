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
  const { start, end, hint } = resolveEdgeRoute(edge, source, target, nodeSize, gatewayRadius)
  // BF20261013-030：模型与渲染同源——拐点先归一/收敛（严格横平竖直、不重叠、不贪吃蛇）
  const waypoints = canonicalEdgeWaypoints(start, end, edge.waypoints ?? [], hint)
  const path = buildEdgePath(start, end, waypoints, hint)
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
function resolveEdgeRoute(
  edge: Pick<ProcessGraphElement, 'config'>,
  source: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  target: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
  gatewayRadius: number,
): { start: { x: number; y: number }; end: { x: number; y: number }; hint: EdgeRouteHint } {
  const config = (edge.config ?? {}) as Record<string, unknown>
  const start = configAnchor(config.sourceAnchor)
  const end = configAnchor(config.targetAnchor)
  if (start && end) return { start, end, hint: {} }
  const axis = edgePortAxis(source, target, nodeSize)
  const [portStart, portEnd] = edgeEndpoints(source, target, nodeSize, gatewayRadius)
  return { start: portStart, end: portEnd, hint: { sourceAxis: axis, targetAxis: axis } }
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

/**
 * 端口轴向（BF20261013-029）：按两盒间**空隙更大的轴**行走——空隙小的那一轴若作为主行走轴，
 * 其中线会紧贴节点边框、与边框平行（出口视觉贴边）。空隙更大的一轴保证中线有足够净空。
 */
export function edgePortAxis(
  source: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  target: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
): 'h' | 'v' {
  const dx = Math.abs(target.x - source.x)
  const dy = Math.abs(target.y - source.y)
  const horizontalGap = dx - nodeSize.width
  const verticalGap = dy - nodeSize.height
  return verticalGap > horizontalGap ? 'v' : 'h'
}

export function edgeEndpoints(
  source: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  target: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
  gatewayRadius = Math.min(nodeSize.width, nodeSize.height) / 2,
): [{ x: number; y: number }, { x: number; y: number }] {
  const dx = target.x - source.x
  const dy = target.y - source.y
  if (edgePortAxis(source, target, nodeSize) === 'h') {
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

/**
 * 相邻/共用节点中心 → SVG path（M/L 折线；BF20261013-029：横平竖直曼哈顿路由）。
 *
 * 端口连线按主导方向走三肘：水平主导=横-纵-横（竖段居中）、垂直主导=纵-横-纵（横段居中），
 * 保证进出端口方向正确且全部线段横平竖直；用户拐点之间的斜段按该段主导方向单肘折成直角。
 */
export interface EdgeRouteHint {
  /** 起点端口朝向：h=左右缘出线（先横后纵），v=上下缘出线（先纵后横）。 */
  sourceAxis?: 'h' | 'v'
  /** 终点端口朝向：h=左右缘入线，v=上下缘入线。 */
  targetAxis?: 'h' | 'v'
}

/** BF20261013-030：连线最小段长（拖动夹取用）——端口腿保持净空，杜绝贴边与折返。 */
export const EDGE_MIN_SEGMENT = 20
/** BF20261013-030：连线最多段数（超出按端口朝向重建 3 段 Z，杜绝「贪吃蛇」）。 */
export const EDGE_MAX_SEGMENTS = 3

export interface OrthogonalPoint {
  x: number
  y: number
}

/** 连线段手柄（BF20261013-030）：选中连线内段（首尾端口腿除外）的可拖动中点。 */
export interface EdgeSegmentHandle {
  /** 段下标（points[index] → points[index+1]）。 */
  index: number
  /** 段中点（手柄落点）。 */
  x: number
  y: number
  /** 段自身朝向：v=垂直段（左右拖），h=水平段（上下拖）。 */
  orientation: 'h' | 'v'
  /** 拖动轴：垂直段→x，水平段→y。 */
  axis: 'x' | 'y'
  cursor: 'ew-resize' | 'ns-resize'
}

/** 展开折线（BF20261013-029 曼哈顿几何体）：端口腿三肘、拐点之间单肘。 */
export function expandEdgePathPoints(
  source: Pick<PositionedNode, 'x' | 'y'>,
  target: Pick<PositionedNode, 'x' | 'y'>,
  waypoints: ProcessGraphWaypoint[],
  hint: EdgeRouteHint = {},
): OrthogonalPoint[] {
  const raw: OrthogonalPoint[] = [
    { x: source.x, y: source.y },
    ...waypoints.map((point) => ({ x: point.x, y: point.y })),
    { x: target.x, y: target.y },
  ]
  if (raw.length < 2) return []
  const points: OrthogonalPoint[] = [raw[0]]
  for (let index = 1; index < raw.length; index++) {
    const from = points[points.length - 1]
    const to = raw[index]
    if (from.x === to.x || from.y === to.y) {
      points.push(to)
      continue
    }
    const isPortLeg = index === 1 || index === raw.length - 1
    const axis = isPortLeg
      ? index === 1
        ? (hint.sourceAxis ?? defaultAxis(from, to))
        : (hint.targetAxis ?? defaultAxis(from, to))
      : defaultAxis(from, to)
    const horizontal = axis === 'h'
    if (isPortLeg && horizontal) {
      const midX = (from.x + to.x) / 2
      points.push({ x: midX, y: from.y }, { x: midX, y: to.y })
    } else if (isPortLeg) {
      const midY = (from.y + to.y) / 2
      points.push({ x: from.x, y: midY }, { x: to.x, y: midY })
    } else if (horizontal) {
      points.push({ x: to.x, y: from.y })
    } else {
      points.push({ x: from.x, y: to.y })
    }
    points.push(to)
  }
  return points
}

/**
 * 归一折线（BF20261013-030）：去重合点（<epsilon）+ 折叠共线中点。
 * 归一后同向段不再相邻、平行段坐标互不相同 → 折线不可能自重叠。
 */
export function normalizeOrthogonalPoints(
  points: OrthogonalPoint[],
  epsilon = 0.5,
): OrthogonalPoint[] {
  const deduped: OrthogonalPoint[] = []
  for (const point of points) {
    const last = deduped[deduped.length - 1]
    if (last && Math.abs(last.x - point.x) < epsilon && Math.abs(last.y - point.y) < epsilon) {
      continue
    }
    deduped.push({ x: point.x, y: point.y })
  }
  const merged: OrthogonalPoint[] = []
  for (const point of deduped) {
    while (merged.length >= 2) {
      const a = merged[merged.length - 2]
      const b = merged[merged.length - 1]
      const collinear = (a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y)
      if (!collinear) break
      merged.pop()
    }
    merged.push(point)
  }
  return merged
}

/** 折线 → 拐点：内部点即 waypoints（首尾为端口落点，不写入）。 */
export function pointsToWaypoints(points: OrthogonalPoint[]): ProcessGraphWaypoint[] {
  return points.slice(1, -1).map((point) => ({ x: point.x, y: point.y }))
}

/** 内段手柄：首尾端口腿不可拖动（方向由端口决定），只暴露内段。 */
export function edgeSegmentHandles(points: OrthogonalPoint[], minLength = 8): EdgeSegmentHandle[] {
  const handles: EdgeSegmentHandle[] = []
  for (let index = 1; index <= points.length - 3; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) < minLength) continue
    const vertical = from.x === to.x
    handles.push({
      index,
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      orientation: vertical ? 'v' : 'h',
      axis: vertical ? 'x' : 'y',
      cursor: vertical ? 'ew-resize' : 'ns-resize',
    })
  }
  return handles
}

/**
 * 拖动内段（BF20261013-030）：垂直段左右拖（axis=x）、水平段上下拖（axis=y）。
 * 夹取规则：两条相邻段保持原方向且不短于 minSegment（端口腿因此不会反向穿入节点），
 * 拖动只改变该段自身坐标 → 全程严格横平竖直、不产生折返/重叠。无可行区间时原样返回。
 */
export function moveEdgeSegment(
  points: OrthogonalPoint[],
  index: number,
  axis: 'x' | 'y',
  value: number,
  minSegment: number = EDGE_MIN_SEGMENT,
): OrthogonalPoint[] {
  if (index < 1 || index > points.length - 3) return points
  const from = points[index]
  const to = points[index + 1]
  if (from[axis] !== to[axis]) return points
  const prev = points[index - 1]
  const next = points[index + 2]
  let low = Number.NEGATIVE_INFINITY
  let high = Number.POSITIVE_INFINITY
  const prevDirection = Math.sign(from[axis] - prev[axis])
  if (prevDirection > 0) low = Math.max(low, prev[axis] + minSegment)
  else if (prevDirection < 0) high = Math.min(high, prev[axis] - minSegment)
  const nextDirection = Math.sign(next[axis] - to[axis])
  if (nextDirection > 0) high = Math.min(high, next[axis] - minSegment)
  else if (nextDirection < 0) low = Math.max(low, next[axis] + minSegment)
  if (low > high) return points
  const clamped = Math.min(Math.max(value, low), high)
  if (clamped === from[axis]) return points
  return points.map((point, currentIndex) =>
    currentIndex === index || currentIndex === index + 1 ? { ...point, [axis]: clamped } : point,
  )
}

/**
 * 拐点收敛（BF20261013-030）：连线最多 EDGE_MAX_SEGMENTS 段。
 * 超出（历史点击插入产生的「贪吃蛇」）按端口朝向重建 3 段 Z：偏移取折线包围盒中心并夹取净空；
 * 端口对齐退化为直线，两端朝向不同退化为 L。
 */
export function canonicalEdgeWaypoints(
  start: OrthogonalPoint,
  end: OrthogonalPoint,
  waypoints: ProcessGraphWaypoint[],
  hint: EdgeRouteHint = {},
  minSegment: number = EDGE_MIN_SEGMENT,
): ProcessGraphWaypoint[] {
  const points = normalizeOrthogonalPoints(expandEdgePathPoints(start, end, waypoints, hint))
  if (points.length <= EDGE_MAX_SEGMENTS + 1) return pointsToWaypoints(points)
  return pointsToWaypoints(canonicalRoutePoints(start, end, points, hint, minSegment))
}

function canonicalRoutePoints(
  start: OrthogonalPoint,
  end: OrthogonalPoint,
  points: OrthogonalPoint[],
  hint: EdgeRouteHint,
  minSegment: number,
): OrthogonalPoint[] {
  const sourceAxis = hint.sourceAxis ?? segmentAxis(points[0], points[1])
  const targetAxis =
    hint.targetAxis ?? segmentAxis(points[points.length - 2], points[points.length - 1])
  if (sourceAxis !== targetAxis) {
    const corner = sourceAxis === 'v' ? { x: start.x, y: end.y } : { x: end.x, y: start.y }
    return [start, corner, end]
  }
  const center = boundsCenter(points)
  if (sourceAxis === 'v') {
    if (start.x === end.x) return [start, end]
    const midY = clampValue(
      center.y,
      Math.min(start.y, end.y) + minSegment,
      Math.max(start.y, end.y) - minSegment,
    )
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
  }
  if (start.y === end.y) return [start, end]
  const midX = clampValue(
    center.x,
    Math.min(start.x, end.x) + minSegment,
    Math.max(start.x, end.x) - minSegment,
  )
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
}

function segmentAxis(from: OrthogonalPoint, to: OrthogonalPoint): 'h' | 'v' {
  return from.y === to.y ? 'h' : 'v'
}

function boundsCenter(points: OrthogonalPoint[]): OrthogonalPoint {
  let minX = Number.MAX_SAFE_INTEGER
  let minY = Number.MAX_SAFE_INTEGER
  let maxX = Number.MIN_SAFE_INTEGER
  let maxY = Number.MIN_SAFE_INTEGER
  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
}

/** 区间为空（端口过近）时取区间中点，保证仍落在净空范围中心。 */
function clampValue(value: number, low: number, high: number): number {
  if (low > high) return (low + high) / 2
  return Math.min(Math.max(value, low), high)
}

export function buildEdgePath(
  source: Pick<PositionedNode, 'x' | 'y'>,
  target: Pick<PositionedNode, 'x' | 'y'>,
  waypoints: ProcessGraphWaypoint[],
  hint: EdgeRouteHint = {},
): string {
  const points = normalizeOrthogonalPoints(expandEdgePathPoints(source, target, waypoints, hint))
  if (points.length < 2) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function defaultAxis(from: { x: number; y: number }, to: { x: number; y: number }): 'h' | 'v' {
  return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'h' : 'v'
}

/**
 * P62 最终交付 FD01：画布点位的连线命中检测（设计器组件库「点击添加」与拖放同语义）。
 *
 * 背景缺陷：点击添加固定落点为画布中心，而初始 START→END 连线恰好横穿中心，
 * 节点被视觉压在连线上但图中无任何边，发布校验报 2004/2005（断连节点）。
 * 修复语义：点击落点命中既有连线（点到折线段距离 ≤ tolerance）时按连线插入处理，
 * 与拖放到连线（insertNodeOnEdge）一致；未命中才落到画布空白处新增孤立节点。
 * 距离按节点中心与 waypoints 展开的折线段计算（与 buildEdgePath 同一几何）。
 */
export function hitTestEdgeAtPoint(
  nodes: PositionedNode[],
  edges: PositionedEdge[],
  x: number,
  y: number,
  tolerance: number = 14,
): string | null {
  const byId = new Map(nodes.map((node) => [node.id, node] as const))
  let best: { id: string; distance: number } | null = null
  for (const edge of edges) {
    const source = byId.get(edge.sourceId)
    const target = byId.get(edge.targetId)
    if (!source || !target) continue
    const points = [source, ...edge.waypoints, target]
    for (let index = 0; index < points.length - 1; index += 1) {
      const distance = pointToSegmentDistance(x, y, points[index], points[index + 1])
      if (distance <= tolerance && (best === null || distance < best.distance)) {
        best = { id: edge.id, distance }
      }
    }
  }
  return best?.id ?? null
}

function pointToSegmentDistance(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return Math.hypot(px - a.x, py - a.y)
  }
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
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

  function nextId(prefix: string, exclude?: Set<string>): string {
    const existing = new Set([...current.nodes, ...current.edges].map((e) => e.id))
    if (exclude) {
      for (const id of exclude) existing.add(id)
    }
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
          const { start, end, hint } = resolveEdgeRoute(
            edge,
            source,
            target,
            designerNodeSize,
            gatewayRadius,
          )
          return { ...edge, path: buildEdgePath(start, end, edge.waypoints, hint) }
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
        // P62 FD01：同一事务内连续生成两条边 ID，须基于已分配集合递增，
        // 否则两次 nextId 都读到替换前的边集合而产生重复 ID（BPMN cvc-id.2 发布失败）
        const id = nextId('edge', pendingEdgeIds)
        pendingEdgeIds.add(id)
        return {
          id,
          sourceId: from.id,
          targetId: to.id,
          path: buildEdgePath(start, end, []),
          waypoints: [],
          config: {},
        }
      }
      const pendingEdgeIds = new Set<string>()
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
        edges: current.edges.map((edge) => {
          if (edge.id !== id) return edge
          const source = byId.get(edge.sourceId)
          const target = byId.get(edge.targetId)
          if (!source || !target) return edge
          const { start, end, hint } = resolveEdgeRoute(
            edge,
            source,
            target,
            designerNodeSize,
            gatewayRadius,
          )
          // BF20261013-030：写入前收敛（≤3 段、严格横平竖直），模型与渲染始终一致
          const canonical = canonicalEdgeWaypoints(start, end, waypoints, hint)
          return { ...edge, waypoints: canonical, path: buildEdgePath(start, end, canonical, hint) }
        }),
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
                  const { start, end, hint } = resolveEdgeRoute(
                    nextEdge,
                    source,
                    target,
                    designerNodeSize,
                    gatewayRadius,
                  )
                  return buildEdgePath(start, end, nextEdge.waypoints, hint)
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

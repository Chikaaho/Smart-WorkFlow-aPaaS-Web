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

/** 默认流程图走向：自上而下（Owner 0.1.7 口径，取代旧的左右默认）。 */
export const DEFAULT_LAYOUT_DIRECTION = 'TB'

/** 归一化选项：节点坐标来源（只读视图默认走向 vs 设计器图内坐标）。 */
export interface NormalizeGraphOptions {
  /**
   * authored（默认）：按图内/回读坐标，缺坐标回落默认走向；
   * topDown：一律按默认走向「自上而下」重排（只读流程图视图，宽图不再横排缩成一条线）。
   */
  layout?: 'authored' | 'topDown'
}

/** 自上而下分层布局参数。 */
export interface TopDownLayoutOptions {
  /** 相邻层中心的纵向距离。 */
  layerGap?: number
  /** 同层节点中心的最小横向间距。 */
  siblingGap?: number
  originX?: number
  originY?: number
}

/**
 * 自上而下（TB）分层布局——流程图默认走向的唯一实现。
 *
 * 分层：父层全部就绪的节点取 max(父层深)+1（汇合节点落在所有父节点之下）；环内节点
 * 统一落到最大层之下并保持输入顺序。同层按输入顺序等距横向排列。确定性：同输入同输出。
 *
 * 走线规则（Owner 0.1.7 澄清）：布局只决定节点坐标，**不做跨线避让**——不同连线之间
 * 允许重叠/交叉（否则复杂流程无法表达）；单条连线自身不得重叠由折线归一口径保证。
 */
export function layoutGraphTopDown(
  nodes: ReadonlyArray<{ id: string; type?: string | null }>,
  edges: ReadonlyArray<{
    source?: string | null
    target?: string | null
    sourceId?: string | null
    targetId?: string | null
  }>,
  options: TopDownLayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const layerGap = options.layerGap ?? 132
  const siblingGap = options.siblingGap ?? 200
  const originX = options.originX ?? 400
  const originY = options.originY ?? 120

  const ids = nodes.map((node) => node.id)
  const idSet = new Set(ids)
  const parents = new Map<string, string[]>()
  for (const edge of edges) {
    const source = edge.source ?? edge.sourceId ?? null
    const target = edge.target ?? edge.targetId ?? null
    if (!source || !target || source === target) continue
    if (!idSet.has(source) || !idSet.has(target)) continue
    parents.set(target, [...(parents.get(target) ?? []), source])
  }

  const depth = new Map<string, number>()
  const processed = new Set<string>()
  let guard = ids.length * ids.length + ids.length
  while (processed.size < ids.length && guard-- > 0) {
    for (const id of ids) {
      if (processed.has(id)) continue
      const ps = (parents.get(id) ?? []).filter((parent) => idSet.has(parent))
      if (!ps.every((parent) => processed.has(parent))) continue
      const value =
        ps.length === 0 ? 0 : Math.max(...ps.map((parent) => (depth.get(parent) ?? 0) + 1))
      depth.set(id, value)
      processed.add(id)
    }
  }
  // 环内剩余（无根环）：接在已算出最大层之下，保持输入顺序
  const maxDepth = Math.max(0, ...Array.from(depth.values()))
  for (const id of ids) {
    if (!processed.has(id)) depth.set(id, maxDepth + 1)
  }

  const layers = new Map<number, string[]>()
  for (const id of ids) {
    const level = depth.get(id) ?? 0
    layers.set(level, [...(layers.get(level) ?? []), id])
  }

  const positioned = new Map<string, { x: number; y: number }>()
  for (const [level, layer] of layers) {
    layer.forEach((id, index) => {
      positioned.set(id, {
        x: Math.round(originX + (index - (layer.length - 1) / 2) * siblingGap),
        y: Math.round(originY + level * layerGap),
      })
    })
  }
  return positioned
}

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
  options: NormalizeGraphOptions = {},
): RenderSpec {
  const elements = graph.elements ?? []
  const nodes = elements.filter((e) => e.kind === 'node')
  const edges = elements.filter((e) => e.kind === 'edge')

  const resolved = new Map<
    string,
    { x: number; y: number; source: PositionedNode['coordinateSource'] }
  >()
  let compatibilityLayout = false

  // 0.1.7：默认走向「自上而下」——只读视图（layout=topDown）一律按该走向重排；
  // 设计器按图内坐标（authored），仅在整图缺坐标（历史图）时按默认走向还原。
  const hadMissingCoordinates =
    nodes.length > 0 && nodes.some((node) => elementCoordinate(node).source === 'none')
  const missingCoordinates = options.layout === 'topDown' || hadMissingCoordinates
  if (missingCoordinates) {
    const layout = layoutGraphTopDown(nodes, edges)
    for (const node of nodes) {
      const point = layout.get(node.id) ?? { x: 0, y: 0 }
      resolved.set(node.id, { x: point.x, y: point.y, source: 'inferred' })
    }
    // 强制走向不算「兼容布局」——只有真缺坐标才提示来源
    compatibilityLayout = hadMissingCoordinates
  } else {
    for (const node of nodes) {
      const coordinate = elementCoordinate(node)
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
  return {
    id: edge.id,
    sourceId: edge.source,
    targetId: edge.target,
    config: edge.config ?? {},
    ...rebuildEdge(edge, source, target, nodeSize, gatewayRadius, edge.waypoints ?? []),
  }
}

/**
 * BF20261013-030/031：折线重建（模型与渲染同源）——端点/拐点先归一收敛再生成 path。
 * 节点移动、拐点写入、端点改接共用同一入口，避免任一路径绕过收敛产生「贪吃蛇」或绷直。
 * 输入无拐点（自动路由）时保持无拐点：默认路由随节点位置重算，不因移动节点被钉在旧几何上。
 */
function rebuildEdge(
  edge: Pick<ProcessGraphElement, 'config'>,
  source: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  target: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
  gatewayRadius: number,
  waypoints: ProcessGraphWaypoint[],
): { path: string; waypoints: ProcessGraphWaypoint[] } {
  const { start, end, hint } = resolveEdgeRoute(edge, source, target, nodeSize, gatewayRadius)
  const canonical = canonicalEdgeWaypoints(start, end, waypoints, hint)
  const stored = waypoints.length === 0 ? [] : canonical
  return { path: buildEdgePath(start, end, canonical, hint), waypoints: stored }
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
  // BF20261013-034：端口侧可由用户指定（拖端点换端口），缺省按几何自动选择
  const sides = {
    source: configPortSide(config.sourceSide) ?? edgePortSides(source, target, nodeSize).source,
    target: configPortSide(config.targetSide) ?? edgePortSides(source, target, nodeSize).target,
  }
  const [portStart, portEnd] = edgeEndpoints(source, target, nodeSize, gatewayRadius, sides)
  const manualSource = configPortSide(config.sourceSide)
  const manualTarget = configPortSide(config.targetSide)
  return {
    start: portStart,
    end: portEnd,
    hint: {
      sourceAxis: sideAxis(sides.source),
      targetAxis: sideAxis(sides.target),
      sourceStubOutward: manualSource ? sideOutward(manualSource) : undefined,
      targetStubOutward: manualTarget ? sideOutward(manualTarget) : undefined,
    },
  }
}

/** 端口侧外向（沿该侧轴向）：right/bottom=+1，left/top=-1。 */
export function sideOutward(side: PortSide): number {
  return side === 'right' || side === 'bottom' ? 1 : -1
}

/** 端口侧（BF20261013-034）：节点四条边。 */
export type PortSide = 'left' | 'right' | 'top' | 'bottom'

function configPortSide(value: unknown): PortSide | undefined {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom'
    ? value
    : undefined
}

/** 端口侧轴向：左右缘=h（先横后纵），上下缘=v（先纵后横）。 */
export function sideAxis(side: PortSide): 'h' | 'v' {
  return side === 'left' || side === 'right' ? 'h' : 'v'
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

/** BF20261013-035：判定端点落在节点哪条边（用于拖动预览与落点同口径）。 */
export function portSideOf(
  point: OrthogonalPoint,
  node: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
): PortSide {
  const halfWidth = nodeSize.width / 2
  const halfHeight = nodeSize.height / 2
  const distances: Array<[PortSide, number]> = [
    ['left', Math.abs(point.x - (node.x - halfWidth))],
    ['right', Math.abs(point.x - (node.x + halfWidth))],
    ['top', Math.abs(point.y - (node.y - halfHeight))],
    ['bottom', Math.abs(point.y - (node.y + halfHeight))],
  ]
  return distances.reduce((best, current) => (current[1] < best[1] ? current : best))[0]
}

/** BF20261013-035：拖动预览与落下同源——同一 resolveEdgeRoute + 展开，改接前所见即落点结果。 */
export function previewEdgePath(
  edge: Pick<ProcessGraphElement, 'config'>,
  source: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  target: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
  gatewayRadius: number,
  sides: { source?: PortSide; target?: PortSide } = {},
): string {
  const config = { ...(edge.config ?? {}) }
  if (sides.source) config.sourceSide = sides.source
  if (sides.target) config.targetSide = sides.target
  const { start, end, hint } = resolveEdgeRoute({ config }, source, target, nodeSize, gatewayRadius)
  return buildEdgePath(start, end, [], hint)
}

/**
 * BF20261013-036：连线拖动会话期间的**固定光标**。拖动中预览几何每帧变化，光标若仍由命中检测决定，
 * 指针就会在「节点盒 move / 命中路径 pointer / 空白 default」之间随帧切换，观感上光标乱跳。
 * 端点拖动=grabbing（握住端点），内段拖动=按拖动轴（左右可拖 ew-resize / 上下可拖 ns-resize）。
 */
export function edgeDragCursor(kind: 'endpoint' | 'segment', axis: 'x' | 'y'): string {
  if (kind === 'segment') return axis === 'x' ? 'ew-resize' : 'ns-resize'
  return 'grabbing'
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

/** 自动端口侧：按端口轴向（空隙更大的轴）决定两端的边。 */
export function edgePortSides(
  source: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  target: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
): { source: PortSide; target: PortSide } {
  const dx = target.x - source.x
  const dy = target.y - source.y
  if (edgePortAxis(source, target, nodeSize) === 'h') {
    return { source: dx >= 0 ? 'right' : 'left', target: dx >= 0 ? 'left' : 'right' }
  }
  return { source: dy >= 0 ? 'bottom' : 'top', target: dy >= 0 ? 'top' : 'bottom' }
}

export function edgeEndpoints(
  source: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  target: Pick<PositionedNode, 'x' | 'y' | 'type'>,
  nodeSize: { width: number; height: number },
  gatewayRadius = Math.min(nodeSize.width, nodeSize.height) / 2,
  sides?: { source?: PortSide; target?: PortSide },
): [{ x: number; y: number }, { x: number; y: number }] {
  const auto = edgePortSides(source, target, nodeSize)
  return [
    portPoint(source, sides?.source ?? auto.source, nodeSize, gatewayRadius),
    portPoint(target, sides?.target ?? auto.target, nodeSize, gatewayRadius),
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
  /** BF20261013-034：用户指定端口侧时，端口腿用固定小段垂直出入（±1=沿端口轴向的外向），
   *  避免自动居中的肘点落到节点内部或贴着边框走。 */
  sourceStubOutward?: number
  targetStubOutward?: number
}

/** BF20261013-030：连线最小段长（拖动夹取用）——端口腿保持净空，杜绝贴边与折返。 */
export const EDGE_MIN_SEGMENT = 20
/**
 * 连线段数安全上限（BF20261013-031 3→5、BF20261013-033 5→12）：拖端口腿会逐次加折，
 * 正常使用远达不到 12；超过才按端口朝向重建（仅作历史异常数据兜底，不再压平用户形状）。
 */
export const EDGE_MAX_SEGMENTS = 12
/** BF20261013-031：直线拖成滑移折返时的默认跨度（沿线路轴）。 */
export const EDGE_JOG_SPAN = 40
/** BF20261013-033：拖端口腿时端口旁保留的固定端口腿长度（端口本身不动）。 */
export const EDGE_PORT_STUB = 24
/** BF20261013-033：端口腿短于该长度不再给手柄（固定段不可拖，对齐 WPS 参考）。 */
export const EDGE_STUB_HANDLE_MIN = 32

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
  /** BF20261013-031：整条连线为直线时的合成手柄——拖动生成滑移折返（jog）。 */
  straight: boolean
  /** BF20261013-032：端口腿（贴节点边框的一段）——拖动即沿边框滑动端口落点；null=内段/直线。 */
  port: 'source' | 'target' | null
}

/** 内段拖动上下文（BF20261013-031）：端口腿方向以端口几何为准，缺省回退折线当前方向。 */
export interface EdgeSegmentDragContext {
  /** 起点端口外向（沿端口腿轴 +1/-1）。 */
  sourceOutward?: number
  /** 终点端口外向（沿端口腿轴 +1/-1）。 */
  targetOutward?: number
  minSegment?: number
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
  // 两端直连且至少一端为用户指定端口侧：端口旁固定小段 + 单肘连接（朝向互相满足）
  if (raw.length === 2 && (hint.sourceStubOutward || hint.targetStubOutward)) {
    return normalizeOrthogonalPoints(directLegWithStubs(raw[0], raw[1], hint))
  }
  const points: OrthogonalPoint[] = [raw[0]]
  const stubOf = (index: number): number | undefined => {
    if (index === 1) return hint.sourceStubOutward
    if (index === raw.length - 1) return hint.targetStubOutward
    return undefined
  }
  for (let index = 1; index < raw.length; index++) {
    const from = points[points.length - 1]
    const to = raw[index]
    // 用户指定端口侧：端口旁固定小段垂直出入，再单肘接下一段（不穿节点、不贴边）
    const stub = stubOf(index)
    if (stub !== undefined && stub !== 0) {
      const axis: 'x' | 'y' =
        index === 1 ? (hint.sourceAxis === 'h' ? 'x' : 'y') : hint.targetAxis === 'h' ? 'x' : 'y'
      if (index === 1) {
        // 起点端口腿：小段挂起点端口；连接段末端若落在终点端口，按终点朝向接近
        const stubEnd: OrthogonalPoint = { ...from, [axis]: from[axis] + stub * EDGE_PORT_STUB }
        points.push(stubEnd)
        if (stubEnd.x !== to.x && stubEnd.y !== to.y) {
          const approachAxis = index === raw.length - 1 ? hint.targetAxis : undefined
          const horizontal = approachAxis ? approachAxis === 'h' : defaultAxis(stubEnd, to) === 'h'
          points.push(horizontal ? { x: stubEnd.x, y: to.y } : { x: to.x, y: stubEnd.y })
        }
        points.push(to)
      } else {
        // 终点端口腿：小段挂终点端口，连接段垂直于该小段
        const stubEnd: OrthogonalPoint = { ...to, [axis]: to[axis] + stub * EDGE_PORT_STUB }
        if (from.x !== stubEnd.x && from.y !== stubEnd.y) {
          points.push({ x: from.x, y: stubEnd.y })
        }
        points.push(stubEnd, to)
      }
      continue
    }
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
 * 两端直连（无拐点）时按端口侧生成：端口旁固定小段 + 连接段（首段/末段轴向各自满足，
 * 不穿节点、不贴边框）。用户指定侧用固定小段，自动侧沿用居中的端口腿。
 */
function directLegWithStubs(
  start: OrthogonalPoint,
  end: OrthogonalPoint,
  hint: EdgeRouteHint,
): OrthogonalPoint[] {
  const points: OrthogonalPoint[] = [start]
  let current = start
  if (hint.sourceStubOutward) {
    const axis: 'x' | 'y' = hint.sourceAxis === 'h' ? 'x' : 'y'
    const stubEnd: OrthogonalPoint = {
      ...start,
      [axis]: start[axis] + hint.sourceStubOutward * EDGE_PORT_STUB,
    }
    points.push(stubEnd)
    current = stubEnd
  }
  let goal = end
  if (hint.targetStubOutward) {
    const axis: 'x' | 'y' = hint.targetAxis === 'h' ? 'x' : 'y'
    goal = { ...end, [axis]: end[axis] + hint.targetStubOutward * EDGE_PORT_STUB }
  }
  // 连接段首/末段轴向：有固定小段时垂直于小段，否则沿该端端口轴向
  const firstAxis: 'h' | 'v' = hint.sourceStubOutward
    ? hint.sourceAxis === 'h'
      ? 'v'
      : 'h'
    : (hint.sourceAxis ?? 'h')
  const lastAxis: 'h' | 'v' = hint.targetStubOutward
    ? hint.targetAxis === 'h'
      ? 'v'
      : 'h'
    : (hint.targetAxis ?? 'h')
  if (current.x !== goal.x || current.y !== goal.y) {
    if (firstAxis === lastAxis) {
      if (firstAxis === 'h') {
        if (current.y !== goal.y) {
          const midX = (current.x + goal.x) / 2
          points.push({ x: midX, y: current.y }, { x: midX, y: goal.y })
        }
      } else if (current.x !== goal.x) {
        const midY = (current.y + goal.y) / 2
        points.push({ x: current.x, y: midY }, { x: goal.x, y: midY })
      }
    } else if (firstAxis === 'h') {
      points.push({ x: goal.x, y: current.y })
    } else {
      points.push({ x: current.x, y: goal.y })
    }
  }
  if (goal !== end) points.push(goal)
  points.push(end)
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

/**
 * 段手柄：**每一段都可拖**——垂直段左右拖、水平段上下拖。
 * - 内段（BF030）：移动该段本身；
 * - 端口腿（BF20261013-032）：沿节点边框滑动端口落点（贴节点的两段也能拖）；
 * - 整条直线（BF031）：合成中点手柄，拖动生成滑移折返（jog）。
 */
export function edgeSegmentHandles(points: OrthogonalPoint[], minLength = 8): EdgeSegmentHandle[] {
  if (points.length === 2) {
    const [from, to] = points
    const vertical = from.x === to.x
    const horizontal = from.y === to.y
    if (vertical === horizontal) return []
    if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) < minLength * 2) return []
    return [
      {
        index: 0,
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2,
        orientation: vertical ? 'v' : 'h',
        axis: vertical ? 'x' : 'y',
        cursor: vertical ? 'ew-resize' : 'ns-resize',
        straight: true,
        port: null,
      },
    ]
  }
  const handles: EdgeSegmentHandle[] = []
  for (let index = 0; index <= points.length - 2; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
    const port: 'source' | 'target' | null =
      index === 0 ? 'source' : index === points.length - 2 ? 'target' : null
    // BF20261013-033：端口旁固定小段不给手柄（拖端口腿会生成该固定段）
    if (length < (port ? Math.max(minLength, EDGE_STUB_HANDLE_MIN) : minLength)) continue
    const vertical = from.x === to.x
    handles.push({
      index,
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      orientation: vertical ? 'v' : 'h',
      axis: vertical ? 'x' : 'y',
      cursor: vertical ? 'ew-resize' : 'ns-resize',
      straight: false,
      port,
    })
  }
  return handles
}

/**
 * 拖动内段（BF20261013-030 / BF20261013-031）：垂直段左右拖（axis=x）、水平段上下拖（axis=y）。
 * 夹取规则（031 修订）：
 * - 端口腿（首尾段）保持**端口外向**（方向取自端口几何，不再取自折线当前方向——节点移动后
 *   折线方向可能已反向，会把可拖区间锁成单向，Owner 反馈「只能移动一个方向」）；
 * - 非端口腿的相邻段只禁止塌缩（可越过固定端，按拖动前一侧推离）；
 * - 拖动只改变该段自身坐标 → 全程严格横平竖直、不产生重叠。无可行区间时原样返回。
 */
export function moveEdgeSegment(
  points: OrthogonalPoint[],
  index: number,
  axis: 'x' | 'y',
  value: number,
  context: EdgeSegmentDragContext = {},
): OrthogonalPoint[] {
  const minSegment = context.minSegment ?? EDGE_MIN_SEGMENT
  if (points.length === 2) return straightDragPoints(points, axis, value, minSegment)
  // BF20261013-033：端口腿拖动——端口不动，端口旁保留固定小段，被拖段移到指针处（折数 +2）
  if (index === 0 || index === points.length - 2) {
    return portLegDragPoints(points, index, axis, value, minSegment)
  }
  if (index < 1 || index > points.length - 3) return points
  const from = points[index]
  const to = points[index + 1]
  if (from[axis] !== to[axis]) return points
  const prev = points[index - 1]
  const next = points[index + 2]
  const sourceStub = index === 1
  const targetStub = index === points.length - 3
  const sourceSign = sourceStub ? context.sourceOutward || Math.sign(from[axis] - prev[axis]) : 0
  const targetSign = targetStub ? context.targetOutward || Math.sign(to[axis] - next[axis]) : 0
  let low = Number.NEGATIVE_INFINITY
  let high = Number.POSITIVE_INFINITY
  if (sourceSign > 0) low = Math.max(low, prev[axis] + minSegment)
  else if (sourceSign < 0) high = Math.min(high, prev[axis] - minSegment)
  if (targetSign > 0) low = Math.max(low, next[axis] + minSegment)
  else if (targetSign < 0) high = Math.min(high, next[axis] - minSegment)
  if (low > high) return points
  // BF20261013-033：内段可拖到相邻段坐标（该段折叠消失，形状随之简化），
  // 只保留端口腿外向约束（不反向穿入节点）；折叠不会产生重叠（归一保证）
  const clamped = Math.min(Math.max(value, low), high)
  if (clamped === from[axis]) return points
  return points.map((point, currentIndex) =>
    currentIndex === index || currentIndex === index + 1 ? { ...point, [axis]: clamped } : point,
  )
}

/**
 * 直线拖动（BF20261013-031）：端口对齐的整条直线没有可拖内段，拖动其合成手柄生成
 * 滑移折返（jog，5 段）：两端端口腿保持垂直出入，中段滑移跟随指针，跨度默认 EDGE_JOG_SPAN。
 * 线路过短（容不下两端净空 + 跨度）时原样返回。
 */
function straightDragPoints(
  points: OrthogonalPoint[],
  axis: 'x' | 'y',
  value: number,
  minSegment: number,
): OrthogonalPoint[] {
  const [start, end] = points
  const vertical = start.x === end.x
  if (vertical === (start.y === end.y)) return points
  if ((vertical && axis !== 'x') || (!vertical && axis !== 'y')) return points
  const along: 'x' | 'y' = vertical ? 'y' : 'x'
  const low = Math.min(start[along], end[along]) + minSegment
  const high = Math.max(start[along], end[along]) - minSegment
  if (high - low < minSegment) return points
  const span = Math.min(EDGE_JOG_SPAN, high - low)
  const middle = (start[along] + end[along]) / 2
  const first = Math.min(Math.max(middle - span / 2, low), high - span)
  const second = first + span
  const firstAlong = start[along] <= end[along] ? first : second
  const secondAlong = start[along] <= end[along] ? second : first
  const base = start[axis]
  const offset =
    Math.abs(value - base) < minSegment ? base + (value >= base ? minSegment : -minSegment) : value
  if (vertical) {
    const x = start.x
    return [
      start,
      { x, y: firstAlong },
      { x: offset, y: firstAlong },
      { x: offset, y: secondAlong },
      { x, y: secondAlong },
      end,
    ]
  }
  const y = start.y
  return [
    start,
    { x: firstAlong, y },
    { x: firstAlong, y: offset },
    { x: secondAlong, y: offset },
    { x: secondAlong, y },
    end,
  ]
}

/**
 * 端口腿拖动（BF20261013-033，Owner 口径）：**端口落点不动**，端口旁保留固定小段
 * （EDGE_PORT_STUB），被拖的段移到指针坐标（因此折数 +2，如「上面的横线往下拉」→
 * 竖线随之变短）。拖回端口所在坐标时折自动消失（归一折叠）。
 */
function portLegDragPoints(
  points: OrthogonalPoint[],
  index: number,
  axis: 'x' | 'y',
  value: number,
  minSegment: number,
): OrthogonalPoint[] {
  const last = points.length - 1
  const source = index === 0
  const port = source ? points[0] : points[last]
  const inner = source ? points[1] : points[last - 1]
  if (port[axis] !== inner[axis]) return points
  const stubAxis: 'x' | 'y' = axis === 'x' ? 'y' : 'x'
  if (port[stubAxis] === inner[stubAxis]) return points
  const direction = Math.sign(inner[stubAxis] - port[stubAxis])
  const stubEnd: OrthogonalPoint = {
    ...port,
    [stubAxis]: port[stubAxis] + direction * EDGE_PORT_STUB,
  }
  // 折长（固定小段 → 被拖段）不得短于最小段长：按拖动方向推离端口
  const target =
    Math.abs(value - port[axis]) < minSegment
      ? port[axis] + (value >= port[axis] ? minSegment : -minSegment)
      : value
  const bend: OrthogonalPoint = { ...stubEnd, [axis]: target }
  const movedInner: OrthogonalPoint = { ...inner, [axis]: target }
  if (source)
    return normalizeOrthogonalPoints([port, stubEnd, bend, movedInner, ...points.slice(2)])
  return normalizeOrthogonalPoints([...points.slice(0, last - 1), movedInner, bend, stubEnd, port])
}

/**
 * 拐点收敛（BF20261013-030/031）：连线最多 EDGE_MAX_SEGMENTS（=5）段。
 * 超出按端口朝向重建：两端朝向不同 → L；端口对齐 → 保留滑移折返（jog，不绷直成直线）；
 * 其余 → 3 段 Z（偏移取折线包围盒中心并夹取净空）。
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
    if (start.x === end.x) return alignedJogPoints(start, end, center.x, minSegment, 'v')
    const midY = clampValue(
      center.y,
      Math.min(start.y, end.y) + minSegment,
      Math.max(start.y, end.y) - minSegment,
    )
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]
  }
  if (start.y === end.y) return alignedJogPoints(start, end, center.y, minSegment, 'h')
  const midX = clampValue(
    center.x,
    Math.min(start.x, end.x) + minSegment,
    Math.max(start.x, end.x) - minSegment,
  )
  return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
}

/**
 * 端口对齐时的滑移折返（BF20261013-031）：两端端口腿保持垂直出入，中段按滑移量横向偏移。
 * 不再退化成直线（Owner 反馈「拖动线会绷直」）；线路过短容不下折返时只能直线。
 */
function alignedJogPoints(
  start: OrthogonalPoint,
  end: OrthogonalPoint,
  offsetCoordinate: number,
  minSegment: number,
  axis: 'v' | 'h',
): OrthogonalPoint[] {
  const along: 'x' | 'y' = axis === 'v' ? 'y' : 'x'
  const low = Math.min(start[along], end[along]) + minSegment
  const high = Math.max(start[along], end[along]) - minSegment
  if (high - low < minSegment) return [start, end]
  const span = Math.min(EDGE_JOG_SPAN, high - low)
  const middle = (start[along] + end[along]) / 2
  const first = Math.min(Math.max(middle - span / 2, low), high - span)
  const second = first + span
  const firstAlong = start[along] <= end[along] ? first : second
  const secondAlong = start[along] <= end[along] ? second : first
  const base = start[axis === 'v' ? 'x' : 'y']
  const offset =
    Math.abs(offsetCoordinate - base) < minSegment
      ? base + (offsetCoordinate >= base ? minSegment : -minSegment)
      : offsetCoordinate
  if (axis === 'v') {
    const x = start.x
    return [
      start,
      { x, y: firstAlong },
      { x: offset, y: firstAlong },
      { x: offset, y: secondAlong },
      { x, y: secondAlong },
      end,
    ]
  }
  const y = start.y
  return [
    start,
    { x: firstAlong, y },
    { x: firstAlong, y: offset },
    { x: secondAlong, y: offset },
    { x: secondAlong, y },
    end,
  ]
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
 * BF20261013-031：按**真实渲染折线**（edge.path）判定——自动路由折线的中段同样可命中，
 * 视觉上不存在连线的「源-目标直连虚位」不再命中；path 缺失时回退 源-拐点-目标。
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
    const rendered = parsePathPoints(edge.path)
    let points: OrthogonalPoint[] = rendered
    if (points.length < 2) {
      const source = byId.get(edge.sourceId)
      const target = byId.get(edge.targetId)
      if (!source || !target) continue
      points = [source, ...edge.waypoints, target]
    }
    for (let index = 0; index < points.length - 1; index += 1) {
      const distance = pointToSegmentDistance(x, y, points[index], points[index + 1])
      if (distance <= tolerance && (best === null || distance < best.distance)) {
        best = { id: edge.id, distance }
      }
    }
  }
  return best?.id ?? null
}

/** 解析折线 path d（M/L 序列）为点序列（命中检测与手柄几何共用）。 */
export function parsePathPoints(d: string): OrthogonalPoint[] {
  const points: OrthogonalPoint[] = []
  const re = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g
  let match = re.exec(d)
  while (match) {
    points.push({ x: Number(match[1]), y: Number(match[2]) })
    match = re.exec(d)
  }
  return points
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
  /** V011-BUG-025/034：拖动端点改接节点或换端口侧（自环/重复边校验；空放回退由调用方处理）。 */
  setEdgeEndpoint(
    id: string,
    which: 'source' | 'target',
    nodeId: string,
    side?: PortSide,
  ): string | null
  undo(): void
  canUndo(): boolean
  /** 0.1.7：按默认走向「自上而下」重排全部节点并回归默认路由（一次撤销单元）。 */
  layoutTopDown(options?: TopDownLayoutOptions): void
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
          return {
            ...edge,
            ...rebuildEdge(edge, source, target, designerNodeSize, gatewayRadius, edge.waypoints),
          }
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
          // BF20261013-030/031：写入前收敛（段数上限 + 严格横平竖直），模型与渲染始终一致
          return {
            ...edge,
            ...rebuildEdge(edge, source, target, designerNodeSize, gatewayRadius, waypoints),
          }
        }),
        dirty: true,
      }
      emit()
    },
    /**
     * V011-BUG-025/034：端点改接。校验：目标存在、不接向对端（自环禁止）、
     * 改接后不得与既有边重复（双向判定）；改接侧显式锚点失效（config 清除）。
     * BF20261013-034：
     * - 可指定端口侧（拖端点换到节点其他端口）；同节点且同侧 = 无变化；
     * - **改接到另一个节点时丢弃原拐点**（旧拐点基于旧几何，保留会画出乱线）；
     *   同节点换端口侧保留拐点（几何相近，用户形状仍有效）。
     */
    setEdgeEndpoint(edgeId, which, nodeId, side) {
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
      const currentEndId = which === 'source' ? edge.sourceId : edge.targetId
      const sideKey = which === 'source' ? 'sourceSide' : 'targetSide'
      const currentEndNode = byId.get(currentEndId)
      // 有效当前侧 = 显式配置 ?? 按当前几何自动选择（避免「同侧」被误判为变化）
      const autoSide = currentEndNode
        ? edgePortSides(
            which === 'source' ? node : (byId.get(edge.sourceId) as PositionedNode),
            which === 'source' ? (byId.get(edge.targetId) as PositionedNode) : node,
            designerNodeSize,
          )[which]
        : undefined
      const currentSide = configPortSide(edge.config[sideKey]) ?? autoSide
      const nodeChanged = nodeId !== currentEndId
      const sideChanged = side !== undefined && side !== currentSide
      if (!nodeChanged && !sideChanged) return null
      pushHistory()
      const config = { ...edge.config }
      delete config[which === 'source' ? 'sourceAnchor' : 'targetAnchor']
      if (side) config[sideKey] = side
      const nextEdge = {
        ...edge,
        sourceId: which === 'source' ? nodeId : edge.sourceId,
        targetId: which === 'target' ? nodeId : edge.targetId,
        config,
        // 端点/端口侧一变，旧拐点即基于旧几何：一律丢弃重排（否则会画出乱线或穿节点）
        waypoints: [],
      }
      const source = byId.get(nextEdge.sourceId)
      const target = byId.get(nextEdge.targetId)
      current = {
        ...current,
        edges: current.edges.map((candidate) => {
          if (candidate.id !== edgeId) return candidate
          if (!source || !target) return nextEdge
          return {
            ...nextEdge,
            ...rebuildEdge(
              nextEdge,
              source,
              target,
              designerNodeSize,
              gatewayRadius,
              nextEdge.waypoints,
            ),
          }
        }),
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
    layoutTopDown(options) {
      const layout = layoutGraphTopDown(current.nodes, current.edges, {
        siblingGap: designerNodeSize.width + 48,
        layerGap: designerNodeSize.height + 76,
        ...options,
      })
      const nodes: PositionedNode[] = current.nodes.map((node) => {
        const point = layout.get(node.id)
        return point
          ? { ...node, x: point.x, y: point.y, coordinateSource: 'explicit' as const }
          : node
      })
      const moved = nodes.some((node, index) => {
        const before = current.nodes[index]
        return node.x !== before.x || node.y !== before.y
      })
      if (!moved) return
      const byId = new Map(nodes.map((node) => [node.id, node] as const))
      const edges: PositionedEdge[] = current.edges.map((edge) => {
        const source = byId.get(edge.sourceId)
        const target = byId.get(edge.targetId)
        if (!source || !target) return edge
        // 自动布局后回归默认路由：历史拐点会钉住旧几何（复杂流程里表现为单线自重叠）
        return {
          ...edge,
          ...rebuildEdge(edge, source, target, designerNodeSize, gatewayRadius, []),
        }
      })
      pushHistory()
      current = { ...current, nodes, edges, dirty: true }
      emit()
    },
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

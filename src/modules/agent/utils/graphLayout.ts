/**
 * 图设计器布局工具（G1-3）。
 *
 * - layoutGraph：按出边分层（START 为根，BFS 分配列；环边/不可达节点兜底），
 *   层内保持节点数组顺序纵向排列，返回带新坐标的节点副本。
 * - findFreePosition：网格扫描找不与其他节点重叠的空位（连续添加不重叠）。
 * - positionAfterNode：在指定节点右侧找插入位。
 *
 * 纯函数、无 Vue 依赖，单测覆盖。
 */
import type { FlowGraphEdge, FlowGraphNode } from '@/adapters/flow-graph'

export interface GraphPoint {
  x: number
  y: number
}

/** 节点占位尺寸（判断重叠用；卡片视觉宽度约 168~240px） */
export const NODE_SLOT_WIDTH = 220
export const NODE_SLOT_HEIGHT = 96
export const NODE_GAP_X = 60
export const NODE_GAP_Y = 36
export const GRID_STEP_X = NODE_SLOT_WIDTH + NODE_GAP_X
export const GRID_STEP_Y = NODE_SLOT_HEIGHT + NODE_GAP_Y
export const LAYOUT_ORIGIN: GraphPoint = { x: 80, y: 80 }

function overlaps(a: GraphPoint, b: GraphPoint): boolean {
  return Math.abs(a.x - b.x) < GRID_STEP_X && Math.abs(a.y - b.y) < GRID_STEP_Y
}

/** 节点是否已占据给定点（排除 excludeId 自身） */
export function isPositionOccupied(
  nodes: FlowGraphNode[],
  point: GraphPoint,
  excludeId?: string,
): boolean {
  return nodes.some((n) => n.id !== excludeId && overlaps(n.position, point))
}

/**
 * 网格扫描找空位：优先 preferred，其次从起点按列优先逐格尝试，
 * 30×30 格内必有一空位（超过则返回最后一个候选，不抛错）。
 */
export function findFreePosition(
  nodes: FlowGraphNode[],
  preferred?: GraphPoint,
  excludeId?: string,
): GraphPoint {
  if (preferred && !isPositionOccupied(nodes, preferred, excludeId)) {
    return { ...preferred }
  }
  const startX = preferred?.x ?? LAYOUT_ORIGIN.x
  const startY = preferred?.y ?? LAYOUT_ORIGIN.y
  for (let row = 0; row < 30; row++) {
    for (let col = 0; col < 30; col++) {
      const candidate = { x: startX + col * GRID_STEP_X, y: startY + row * GRID_STEP_Y }
      if (!isPositionOccupied(nodes, candidate, excludeId)) return candidate
    }
  }
  return { x: startX, y: startY }
}

/** 在节点右侧的插入位（优先正右，被占则向下寻找空位） */
export function positionAfterNode(node: FlowGraphNode, nodes: FlowGraphNode[]): GraphPoint {
  const preferred = { x: node.position.x + GRID_STEP_X, y: node.position.y }
  return findFreePosition(nodes, preferred, node.id)
}

/** 两条连线之间的插入位（取源/目标中点附近找空位） */
export function positionBetweenNodes(
  from: FlowGraphNode | undefined,
  to: FlowGraphNode | undefined,
  nodes: FlowGraphNode[],
): GraphPoint {
  if (!from || !to) return findFreePosition(nodes)
  const preferred = {
    x: (from.position.x + to.position.x) / 2,
    y: (from.position.y + to.position.y) / 2,
  }
  return findFreePosition(nodes, preferred)
}

/**
 * 分层自动布局：从 START 出发 BFS 分配列（列距 GRID_STEP_X），
 * 同层节点纵向排开（行距 GRID_STEP_Y）。无 START 时按节点顺序排列；
 * 不可达节点追加在最大层之后，保持原相对顺序。
 */
export function layoutGraph(nodes: FlowGraphNode[], edges: FlowGraphEdge[]): FlowGraphNode[] {
  if (nodes.length === 0) return []

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    const list = outgoing.get(edge.source) ?? []
    list.push(edge.target)
    outgoing.set(edge.source, list)
  }

  const start = nodes.find((n) => n.type === 'START') ?? nodes[0]
  const levelById = new Map<string, number>([[start.id, 0]])
  const queue: string[] = [start.id]
  const order: string[] = [start.id]
  while (queue.length > 0) {
    const current = queue.shift() as string
    const level = levelById.get(current) ?? 0
    for (const next of outgoing.get(current) ?? []) {
      if (levelById.has(next)) continue
      levelById.set(next, level + 1)
      queue.push(next)
      order.push(next)
    }
  }

  // 同层行号：按 BFS 访问顺序分配
  const rowByLevel = new Map<number, number>()
  const positionById = new Map<string, GraphPoint>()
  for (const id of order) {
    const level = levelById.get(id) ?? 0
    const row = rowByLevel.get(level) ?? 0
    rowByLevel.set(level, row + 1)
    positionById.set(id, {
      x: LAYOUT_ORIGIN.x + level * GRID_STEP_X,
      y: LAYOUT_ORIGIN.y + row * GRID_STEP_Y,
    })
  }

  // 不可达节点：追加到最右侧列，逐行排开
  let maxLevel = Math.max(0, ...Array.from(levelById.values()))
  const unreachable = nodes.filter((n) => !positionById.has(n.id))
  if (unreachable.length > 0) {
    maxLevel += 1
    unreachable.forEach((node, index) => {
      positionById.set(node.id, {
        x: LAYOUT_ORIGIN.x + maxLevel * GRID_STEP_X,
        y: LAYOUT_ORIGIN.y + index * GRID_STEP_Y,
      })
    })
  }

  return nodes.map((node) => {
    const position = positionById.get(node.id)
    return position ? { ...node, position: { ...position } } : node
  })
}

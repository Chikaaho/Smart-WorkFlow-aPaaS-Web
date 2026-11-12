import { describe, it, expect } from 'vitest'
import type { FlowGraphEdge, FlowGraphNode } from '@/adapters/flow-graph'
import {
  GRID_STEP_X,
  LAYOUT_ORIGIN,
  findFreePosition,
  isPositionOccupied,
  layoutGraph,
  positionAfterNode,
} from './graphLayout'

function node(id: string, type: string, x = 0, y = 0): FlowGraphNode {
  return { id, type, position: { x, y } }
}

function edge(id: string, source: string, target: string): FlowGraphEdge {
  return { id, source, target }
}

describe('graphLayout', () => {
  it('layoutGraph：从 START BFS 分层，同层纵向排开', () => {
    const nodes = [
      node('start', 'START', 999, 999),
      node('llm', 'LLM', 999, 999),
      node('cond', 'CONDITION', 999, 999),
      node('end', 'END', 999, 999),
    ]
    const edges = [edge('e1', 'start', 'llm'), edge('e2', 'llm', 'cond'), edge('e3', 'cond', 'end')]
    const laidOut = layoutGraph(nodes, edges)
    const pos = (id: string) => laidOut.find((n) => n.id === id)!.position
    expect(pos('start')).toEqual({ x: LAYOUT_ORIGIN.x, y: LAYOUT_ORIGIN.y })
    expect(pos('llm')).toEqual({ x: LAYOUT_ORIGIN.x + GRID_STEP_X, y: LAYOUT_ORIGIN.y })
    expect(pos('cond')).toEqual({ x: LAYOUT_ORIGIN.x + 2 * GRID_STEP_X, y: LAYOUT_ORIGIN.y })
    expect(pos('end')).toEqual({ x: LAYOUT_ORIGIN.x + 3 * GRID_STEP_X, y: LAYOUT_ORIGIN.y })
  })

  it('layoutGraph：同层多节点纵向错开，环边不重复访问', () => {
    const nodes = [node('start', 'START'), node('a', 'LLM'), node('b', 'LLM'), node('end', 'END')]
    const edges = [
      edge('e1', 'start', 'a'),
      edge('e2', 'start', 'b'),
      edge('e3', 'a', 'end'),
      edge('e4', 'b', 'end'),
      edge('cycle', 'b', 'a'),
    ]
    const laidOut = layoutGraph(nodes, edges)
    const a = laidOut.find((n) => n.id === 'a')!
    const b = laidOut.find((n) => n.id === 'b')!
    expect(a.position.x).toBe(b.position.x)
    expect(a.position.y).not.toBe(b.position.y)
  })

  it('layoutGraph：不可达节点追加到最右列，不丢节点', () => {
    const nodes = [node('start', 'START'), node('a', 'END'), node('orphan', 'TOOL')]
    const edges = [edge('e1', 'start', 'a')]
    const laidOut = layoutGraph(nodes, edges)
    const orphan = laidOut.find((n) => n.id === 'orphan')!
    const a = laidOut.find((n) => n.id === 'a')!
    expect(orphan.position.x).toBeGreaterThan(a.position.x)
    expect(laidOut).toHaveLength(3)
  })

  it('findFreePosition：优先空位原样返回，占用则换格且不重叠', () => {
    const nodes = [node('a', 'LLM', 100, 100)]
    expect(findFreePosition(nodes, { x: 500, y: 100 })).toEqual({ x: 500, y: 100 })

    const occupied = findFreePosition(nodes, { x: 100, y: 100 })
    expect(occupied).not.toEqual({ x: 100, y: 100 })
    expect(isPositionOccupied(nodes, occupied)).toBe(false)
  })

  it('positionAfterNode：节点右侧一格，被占则换空位', () => {
    const nodes = [node('a', 'LLM', 100, 100)]
    expect(positionAfterNode(nodes[0], nodes)).toEqual({ x: 100 + GRID_STEP_X, y: 100 })

    const blocked = [...nodes, node('b', 'TOOL', 100 + GRID_STEP_X, 100)]
    const next = positionAfterNode(blocked[0], blocked)
    expect(isPositionOccupied(blocked, next, 'a')).toBe(false)
    expect(next).not.toEqual({ x: 100 + GRID_STEP_X, y: 100 })
  })
})

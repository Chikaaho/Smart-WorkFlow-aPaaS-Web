import { describe, it, expect, vi } from 'vitest'
import {
  normalizeGraph,
  createDesignerModel,
  buildEdgePath,
  canonicalEdgeWaypoints,
  parsePathPoints,
  edgeDragCursor,
  edgePortAxis,
  edgeSegmentHandles,
  expandEdgePathPoints,
  EDGE_PORT_STUB,
  hitTestEdgeAtPoint,
  moveEdgeSegment,
  normalizeOrthogonalPoints,
  pointsToWaypoints,
  portSideOf,
  previewEdgePath,
  EDGE_MIN_SEGMENT,
} from './index'
import type { OrthogonalPoint } from './index'
import type { ProcessGraphDocument } from '@/contracts/process-graph'

function pathPoints(d: string): OrthogonalPoint[] {
  const points: OrthogonalPoint[] = []
  const re = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g
  let match = re.exec(d)
  while (match) {
    points.push({ x: Number(match[1]), y: Number(match[2]) })
    match = re.exec(d)
  }
  return points
}

/**
 * BF20261013-030/031 不变量：严格横平竖直 + 任意两段不重叠。
 * 共线但区间不相交（滑移折返 jog 的两条平行段）是合法形状，只有区间相交才算重叠。
 */
function expectOrthogonalWithoutOverlap(points: OrthogonalPoint[]) {
  for (let i = 0; i < points.length - 1; i++) {
    const axisAligned = points[i].x === points[i + 1].x || points[i].y === points[i + 1].y
    expect(axisAligned).toBe(true)
  }
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 1; j < points.length - 1; j++) {
      const verticalI = points[i].x === points[i + 1].x
      const verticalJ = points[j].x === points[j + 1].x
      if (verticalI !== verticalJ) continue
      const sameLine = verticalI ? points[i].x === points[j].x : points[i].y === points[j].y
      if (!sameLine) continue
      const key = verticalI ? 'y' : 'x'
      const [a1, a2] = [points[i][key], points[i + 1][key]].sort((left, right) => left - right)
      const [b1, b2] = [points[j][key], points[j + 1][key]].sort((left, right) => left - right)
      expect(a2 <= b1 || b2 <= a1).toBe(true)
    }
  }
}

function baseGraph(): ProcessGraphDocument {
  return {
    processKey: 'bpm_demo',
    name: '演示流程',
    formKey: 'demo_form',
    version: 1,
    elements: [
      { id: 'node_start', kind: 'node', type: 'START', x: 100, y: 300, config: {}, style: {} },
      { id: 'node_end', kind: 'node', type: 'END', x: 700, y: 300, config: {}, style: {} },
      { id: 'edge_1', kind: 'edge', source: 'node_start', target: 'node_end' },
    ],
    canvas: {},
  }
}

describe('normalizeGraph', () => {
  it('显式坐标契约优先，不生成兼容布局', () => {
    const spec = normalizeGraph(baseGraph())
    expect(spec.compatibilityLayout).toBe(false)
    expect(spec.nodes).toHaveLength(2)
    expect(spec.nodes[0].coordinateSource).toBe('explicit')
    expect(spec.nodes[0].x).toBe(100)
  })

  it('旧图缺坐标时进入确定性兼容布局，两次输入结果稳定（不因数组顺序漂移）', () => {
    const legacy: ProcessGraphDocument = {
      ...baseGraph(),
      contractVersion: undefined,
      elements: baseGraph().elements.map((e) => ({
        ...e,
        x: undefined,
        y: undefined,
        style: e.kind === 'node' ? {} : e.style,
      })),
    }
    const first = normalizeGraph(legacy)
    const second = normalizeGraph({ ...legacy, elements: [...legacy.elements].reverse() })
    expect(first.compatibilityLayout).toBe(true)
    expect(second.compatibilityLayout).toBe(true)
    const as = Object.fromEntries(first.nodes.map((n) => [n.id, n]))
    const bs = Object.fromEntries(second.nodes.map((n) => [n.id, n]))
    for (const id of Object.keys(as)) {
      expect(bs[id].x).toBe(as[id].x)
      expect(bs[id].y).toBe(as[id].y)
    }
  })

  it('边跟随两端节点坐标生成 path', () => {
    const spec = normalizeGraph(baseGraph())
    expect(spec.edges).toHaveLength(1)
    expect(spec.edges[0].path.startsWith('M')).toBe(true)
    expect(spec.edges[0].sourceId).toBe('node_start')
    expect(spec.edges[0].targetId).toBe('node_end')
  })
})

describe('buildEdgePath', () => {
  it('BF20261013-029：横平竖直曼哈顿路由（斜段按端口朝向折成直角）', () => {
    const path = buildEdgePath({ x: 0, y: 0 }, { x: 100, y: 100 }, [{ x: 50, y: 0 }])
    expect(path).toBe('M 0 0 L 50 0 L 50 50 L 100 50 L 100 100')
    // 每一段都必须水平或垂直
    const points = path
      .split(' ')
      .reduce<Array<{ x: number; y: number }>>((acc, token, index, all) => {
        if (token === 'M' || token === 'L')
          acc.push({ x: Number(all[index + 1]), y: Number(all[index + 2]) })
        return acc
      }, [])
    for (let i = 0; i < points.length - 1; i++) {
      const axisAligned = points[i].x === points[i + 1].x || points[i].y === points[i + 1].y
      expect(axisAligned).toBe(true)
    }
  })

  it('BF20261013-029：端口腿按端口朝向出线（上下缘出线先纵后横，不沿边框平行）', () => {
    const path = buildEdgePath({ x: 100, y: 300 }, { x: 386, y: 492 }, [], {
      sourceAxis: 'v',
      targetAxis: 'v',
    })
    expect(path).toBe('M 100 300 L 100 396 L 386 396 L 386 492')
  })
})

describe('edgePortAxis', () => {
  it('BF20261013-029：两盒空隙更大的轴作主行走轴（右下目标走纵向出口，避免贴边平行）', () => {
    // 右下方目标：水平空隙 134 < 垂直空隙 146 → 纵向出口
    expect(
      edgePortAxis(
        { x: 100, y: 300, type: 'APPROVAL' },
        { x: 386, y: 492, type: 'END' },
        { width: 152, height: 46 },
      ),
    ).toBe('v')
    // 近水平目标：水平空隙更大 → 横向出口
    expect(
      edgePortAxis(
        { x: 100, y: 300, type: 'START' },
        { x: 500, y: 340, type: 'APPROVAL' },
        { width: 152, height: 46 },
      ),
    ).toBe('h')
  })
})

describe('BF20261013-030 连线内段编辑（横平竖直 / 不重叠 / 不贪吃蛇）', () => {
  // 审批(420,180)→结束(600,300)：上下缘出线 V-H-V，中段水平可上下拖
  const vhv = {
    start: { x: 420, y: 205 },
    end: { x: 600, y: 275 },
    hint: { sourceAxis: 'v' as const, targetAxis: 'v' as const },
  }

  it('段手柄：V-H-V 每段都可拖（中段上下、端口腿左右）', () => {
    const points = expandEdgePathPoints(vhv.start, vhv.end, [], vhv.hint)
    expect(points).toEqual([
      { x: 420, y: 205 },
      { x: 420, y: 240 },
      { x: 600, y: 240 },
      { x: 600, y: 275 },
    ])
    expect(edgeSegmentHandles(points)).toEqual([
      {
        index: 0,
        x: 420,
        y: 222.5,
        orientation: 'v',
        axis: 'x',
        cursor: 'ew-resize',
        straight: false,
        port: 'source',
      },
      {
        index: 1,
        x: 510,
        y: 240,
        orientation: 'h',
        axis: 'y',
        cursor: 'ns-resize',
        straight: false,
        port: null,
      },
      {
        index: 2,
        x: 600,
        y: 257.5,
        orientation: 'v',
        axis: 'x',
        cursor: 'ew-resize',
        straight: false,
        port: 'target',
      },
    ])
  })

  it('段手柄：H-V-H 每段都可拖（中段左右、端口腿上下）', () => {
    const points = expandEdgePathPoints({ x: 180, y: 300 }, { x: 340, y: 180 }, [], {
      sourceAxis: 'h',
      targetAxis: 'h',
    })
    expect(points).toEqual([
      { x: 180, y: 300 },
      { x: 260, y: 300 },
      { x: 260, y: 180 },
      { x: 340, y: 180 },
    ])
    expect(edgeSegmentHandles(points)).toEqual([
      {
        index: 0,
        x: 220,
        y: 300,
        orientation: 'h',
        axis: 'y',
        cursor: 'ns-resize',
        straight: false,
        port: 'source',
      },
      {
        index: 1,
        x: 260,
        y: 240,
        orientation: 'v',
        axis: 'x',
        cursor: 'ew-resize',
        straight: false,
        port: null,
      },
      {
        index: 2,
        x: 300,
        y: 180,
        orientation: 'h',
        axis: 'y',
        cursor: 'ns-resize',
        straight: false,
        port: 'target',
      },
    ])
  })

  it('拖动内段夹取端口净空：不越出两端、不反向、不产生重叠', () => {
    const points = expandEdgePathPoints(vhv.start, vhv.end, [], vhv.hint)
    // 越界 → 夹到端口净空边界（起点端口 205+20 / 终点端口 275-20）
    expect(moveEdgeSegment(points, 1, 'y', 100)).toEqual([
      { x: 420, y: 205 },
      { x: 420, y: 225 },
      { x: 600, y: 225 },
      { x: 600, y: 275 },
    ])
    expect(moveEdgeSegment(points, 1, 'y', 400)).toEqual([
      { x: 420, y: 205 },
      { x: 420, y: 255 },
      { x: 600, y: 255 },
      { x: 600, y: 275 },
    ])
    // 区间内精确落点 + 全程不变量（横平竖直、任意两段不共线）
    expect(moveEdgeSegment(points, 1, 'y', 250)[1]).toEqual({ x: 420, y: 250 })
    for (let value = -200; value <= 600; value += 17) {
      expectOrthogonalWithoutOverlap(moveEdgeSegment(points, 1, 'y', value))
    }
    // 端口腿（首尾段）不可拖：原样返回同一引用
    expect(moveEdgeSegment(points, 0, 'y', 100)).toBe(points)
    expect(moveEdgeSegment(points, points.length - 2, 'y', 100)).toBe(points)
    expect(EDGE_MIN_SEGMENT).toBe(20)
  })

  it('归一：去重合点 + 折叠共线中点（同轴同向不再相邻）', () => {
    expect(
      normalizeOrthogonalPoints([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ])
    expect(buildEdgePath({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 50, y: 0 }])).toBe('M 0 0 L 100 0')
  })

  it('超长历史形状（>12 段）按端口朝向重建，不产生重叠', () => {
    const snake: Array<{ x: number; y: number }> = []
    for (let i = 0; i < 12; i += 1) {
      snake.push({ x: 420 + (i % 2) * 140, y: 100 + i * 30 })
    }
    expect(expandEdgePathPoints(vhv.start, vhv.end, snake, vhv.hint).length - 1).toBeGreaterThan(12)
    const waypoints = canonicalEdgeWaypoints(vhv.start, vhv.end, snake, vhv.hint)
    expect(waypoints).toHaveLength(2)
    const path = buildEdgePath(vhv.start, vhv.end, waypoints, vhv.hint)
    expect(pathPoints(path).length - 1).toBe(3)
    expectOrthogonalWithoutOverlap(pathPoints(path))
  })

  it('收敛后模型拐点与渲染同源（normalizeGraph 输出即收敛结果）', () => {
    const snake: Array<{ x: number; y: number }> = []
    for (let i = 0; i < 12; i += 1) {
      snake.push({ x: 420 + (i % 2) * 140, y: 100 + i * 30 })
    }
    const graph: ProcessGraphDocument = {
      processKey: 'bpm_snake',
      name: '超长收敛',
      formKey: 'demo_form',
      version: 1,
      elements: [
        { id: 'node_a', kind: 'node', type: 'APPROVAL', x: 420, y: 180, config: {}, style: {} },
        { id: 'node_b', kind: 'node', type: 'END', x: 600, y: 300, config: {}, style: {} },
        { id: 'edge_1', kind: 'edge', source: 'node_a', target: 'node_b', waypoints: snake },
      ],
      canvas: {},
    }
    const spec = normalizeGraph(graph)
    const edge = spec.edges[0]
    expect(edge.waypoints).toHaveLength(2)
    expect(pathPoints(edge.path).length - 1).toBeLessThanOrEqual(3)
    expectOrthogonalWithoutOverlap(pathPoints(edge.path))
  })

  it('拖动内段后写入拐点：模型路径与折线逐点一致', () => {
    const model = createDesignerModel(
      {
        processKey: 'bpm_drag',
        name: '拖动',
        formKey: 'demo_form',
        version: 1,
        elements: [
          { id: 'node_a', kind: 'node', type: 'APPROVAL', x: 420, y: 180, config: {}, style: {} },
          { id: 'node_b', kind: 'node', type: 'END', x: 600, y: 300, config: {}, style: {} },
          { id: 'edge_1', kind: 'edge', source: 'node_a', target: 'node_b' },
        ],
        canvas: {},
      },
      { width: 160, height: 50 },
      22,
    )
    const edge = model.state().edges[0]
    const points = pathPoints(edge.path)
    const moved = moveEdgeSegment(points, 1, 'y', 252)
    model.setEdgeWaypoints(edge.id, pointsToWaypoints(moved))
    const after = model.state().edges[0]
    expect(pathPoints(after.path)).toEqual(moved)
    expect(after.waypoints).toEqual([
      { x: 420, y: 252 },
      { x: 600, y: 252 },
    ])
    expect(model.state().dirty).toBe(true)
  })
})

describe('BF20261013-035 端点拖动预览与落下同源', () => {
  it('previewEdgePath 结果 = 落下后 path（指定被拖端端口侧）', () => {
    const model = createDesignerModel(
      {
        processKey: 'bpm_preview',
        name: '预览同源',
        formKey: 'demo_form',
        version: 1,
        elements: [
          { id: 'node_a', kind: 'node', type: 'START', x: 100, y: 300, config: {}, style: {} },
          { id: 'node_b', kind: 'node', type: 'APPROVAL', x: 420, y: 180, config: {}, style: {} },
          { id: 'node_c', kind: 'node', type: 'END', x: 100, y: 80, config: {}, style: {} },
          { id: 'edge_1', kind: 'edge', source: 'node_a', target: 'node_b' },
        ],
        canvas: {},
      },
      { width: 160, height: 50 },
      22,
    )
    const state = model.state()
    const edge = state.edges[0]
    const byId = new Map(state.nodes.map((node) => [node.id, node] as const))
    const preview = previewEdgePath(
      edge,
      byId.get('node_c') as (typeof state.nodes)[number],
      byId.get('node_b') as (typeof state.nodes)[number],
      { width: 160, height: 50 },
      22,
      { source: 'bottom' },
    )
    model.setEdgeEndpoint('edge_1', 'source', 'node_c', 'bottom')
    expect(model.state().edges[0].path).toBe(preview)
  })

  it('portSideOf 判定端点所在边', () => {
    const node = { x: 100, y: 300, type: 'START' }
    const size = { width: 160, height: 50 }
    expect(portSideOf({ x: 180, y: 300 }, node, size)).toBe('right')
    expect(portSideOf({ x: 20, y: 300 }, node, size)).toBe('left')
    expect(portSideOf({ x: 100, y: 275 }, node, size)).toBe('top')
    expect(portSideOf({ x: 100, y: 325 }, node, size)).toBe('bottom')
  })
})

describe('BF20261013-036 拖动光标固定 + 目标端预览不镜像', () => {
  const size = { width: 160, height: 50 }
  const doc: ProcessGraphDocument = {
    processKey: 'bpm_cursor',
    name: '拖动光标',
    formKey: 'demo_form',
    version: 1,
    elements: [
      { id: 'node_a', kind: 'node', type: 'START', x: 100, y: 300, config: {}, style: {} },
      { id: 'node_b', kind: 'node', type: 'APPROVAL', x: 420, y: 180, config: {}, style: {} },
      { id: 'node_c', kind: 'node', type: 'END', x: 100, y: 80, config: {}, style: {} },
      { id: 'edge_1', kind: 'edge', source: 'node_a', target: 'node_b' },
    ],
    canvas: {},
  }

  it('拖动会话光标固定：端点=grabbing（与拖动轴无关），内段=按拖动轴', () => {
    expect(edgeDragCursor('endpoint', 'x')).toBe('grabbing')
    expect(edgeDragCursor('endpoint', 'y')).toBe('grabbing')
    expect(edgeDragCursor('segment', 'x')).toBe('ew-resize')
    expect(edgeDragCursor('segment', 'y')).toBe('ns-resize')
  })

  it('被拖端为 target：预览起点=固定端端口、终点=命中节点端口（不镜像），且等于落下后 path', () => {
    const model = createDesignerModel(doc, size, 22)
    const state = model.state()
    const edge = state.edges[0]
    const byId = new Map(state.nodes.map((node) => [node.id, node] as const))
    const fixed = byId.get('node_a') as (typeof state.nodes)[number]
    const hovered = byId.get('node_c') as (typeof state.nodes)[number]
    const preview = previewEdgePath(edge, fixed, hovered, size, 22, { target: 'right' })
    const points = pathPoints(preview)
    // 固定端（START 顶边端口）在前、命中节点（END 右边端口）在后 —— 与改接方向一致
    expect(points[0]).toEqual({ x: 100, y: 275 })
    expect(points[points.length - 1]).toEqual({ x: 180, y: 80 })
    expectOrthogonalWithoutOverlap(points)
    model.setEdgeEndpoint('edge_1', 'target', 'node_c', 'right')
    expect(model.state().edges[0].path).toBe(preview)
  })
})

describe('BF20261013-034 端点改接：换端口侧 + 丢弃失效拐点', () => {
  const base: ProcessGraphDocument = {
    processKey: 'bpm_endpoint',
    name: '改接',
    formKey: 'demo_form',
    version: 1,
    elements: [
      { id: 'node_a', kind: 'node', type: 'START', x: 100, y: 300, config: {}, style: {} },
      { id: 'node_b', kind: 'node', type: 'APPROVAL', x: 420, y: 180, config: {}, style: {} },
      { id: 'node_c', kind: 'node', type: 'END', x: 420, y: 500, config: {}, style: {} },
      { id: 'edge_1', kind: 'edge', source: 'node_a', target: 'node_b' },
    ],
    canvas: {},
  }
  const size = { width: 160, height: 50 }

  it('拖端点落到同节点另一条边 → 换端口侧（左右→上下），固定小段垂直出入', () => {
    const model = createDesignerModel(base, size, 22)
    expect(model.state().edges[0].path).toBe('M 180 300 L 260 300 L 260 180 L 340 180')
    // 先造一个折（端口腿拖动，与真实交互同一路径）
    const points = parsePathPoints(model.state().edges[0].path)
    model.setEdgeWaypoints('edge_1', pointsToWaypoints(moveEdgeSegment(points, 0, 'y', 250)))
    expect(model.state().edges[0].path).toBe(
      'M 180 300 L 204 300 L 204 250 L 260 250 L 260 180 L 340 180',
    )
    // 起点改挂到 START 上缘（同节点换侧）：旧拐点丢弃重排，起点垂直向上固定小段 24
    expect(model.setEdgeEndpoint('edge_1', 'source', 'node_a', 'top')).toBe('edge_1')
    const after = model.state().edges[0]
    expect(after.config.sourceSide).toBe('top')
    expect(after.waypoints).toEqual([])
    const path = parsePathPoints(after.path)
    // 起点垂直向上固定小段 24 → 连接段（水平→垂直）→ 终点从左侧水平进入
    expect(path[0]).toEqual({ x: 100, y: 275 })
    expect(path[1]).toEqual({ x: 100, y: 275 - EDGE_PORT_STUB })
    expect(path[path.length - 1]).toEqual({ x: 340, y: 180 })
    expect(path[path.length - 2].y).toBe(180)
    expectOrthogonalWithoutOverlap(path)
  })

  it('同节点同侧 = 无变化；改接到另一节点丢弃旧拐点', () => {
    const model = createDesignerModel(base, size, 22)
    const points = parsePathPoints(model.state().edges[0].path)
    model.setEdgeWaypoints('edge_1', pointsToWaypoints(moveEdgeSegment(points, 0, 'y', 250)))
    const edge = model.state().edges[0]
    expect(edge.waypoints.length).toBeGreaterThan(0)
    // 同节点同侧：无变化
    expect(model.setEdgeEndpoint('edge_1', 'source', 'node_a', 'right')).toBeNull()
    // 改接到 END（node_c）：旧拐点失效 → 丢弃并重排为干净路由
    expect(model.setEdgeEndpoint('edge_1', 'source', 'node_c', 'bottom')).toBe('edge_1')
    const after = model.state().edges[0]
    expect(after.sourceId).toBe('node_c')
    expect(after.waypoints).toEqual([])
    expect(after.config.sourceSide).toBe('bottom')
    expect(parsePathPoints(after.path)[0]).toEqual({ x: 420, y: 525 })
    expectOrthogonalWithoutOverlap(parsePathPoints(after.path))
    // 自环/重复边仍拒绝
    expect(model.setEdgeEndpoint('edge_1', 'source', 'node_b')).toBeNull()
  })

  it('终点换端口侧（自动起点 + 指定终点）：终点固定小段垂直出入', () => {
    const model = createDesignerModel(base, size, 22)
    expect(model.setEdgeEndpoint('edge_1', 'target', 'node_b', 'top')).toBe('edge_1')
    const after = model.state().edges[0]
    expect(after.config.targetSide).toBe('top')
    const path = parsePathPoints(after.path)
    // 审批 上缘中点 (420,155)，固定小段向上 24 → 连接段水平接近
    expect(path[path.length - 1]).toEqual({ x: 420, y: 155 })
    expect(path[path.length - 2]).toEqual({ x: 420, y: 131 })
    expect(path[path.length - 3].y).toBe(131)
    expectOrthogonalWithoutOverlap(path)
  })

  it('端口侧进入序列化并可回读（normalizeGraph 按指定侧渲染）', () => {
    const model = createDesignerModel(base, size, 22)
    model.setEdgeEndpoint('edge_1', 'target', 'node_b', 'top')
    const graph = model.serialize()
    const edgeElement = graph.elements.find((element) => element.id === 'edge_1')
    expect(edgeElement?.config?.targetSide).toBe('top')
    const reloaded = normalizeGraph(graph, size, 22)
    expect(reloaded.edges[0].path).toBe(model.state().edges[0].path)
  })
})

describe('BF20261013-033 端口腿拖动：端口固定 + 端口旁留固定小段（折数 +2）', () => {
  // START(100,300)→审批(420,180) 的 Z：M 180 300 L 260 300 L 260 180 L 340 180
  const zPoints = [
    { x: 340, y: 180 },
    { x: 260, y: 180 },
    { x: 260, y: 300 },
    { x: 180, y: 300 },
  ]

  it('拖端口腿：端口不动，生成固定小段（24）与被拖段，竖线随之变短', () => {
    const moved = moveEdgeSegment(zPoints, 0, 'y', 220)
    expect(moved).toEqual([
      { x: 340, y: 180 },
      { x: 316, y: 180 },
      { x: 316, y: 220 },
      { x: 260, y: 220 },
      { x: 260, y: 300 },
      { x: 180, y: 300 },
    ])
    expectOrthogonalWithoutOverlap(moved)
    // 端口固定（首点不变）＋固定小段 24；中间竖段由 120 缩到 80（上横线下拉 → 竖线变短）
    expect(moved[0]).toEqual({ x: 340, y: 180 })
    expect(Math.abs(moved[1].x - moved[0].x)).toBe(EDGE_PORT_STUB)
    const verticalBefore = Math.abs(zPoints[2].y - zPoints[1].y)
    const verticalAfter = Math.abs(moved[4].y - moved[3].y)
    expect(verticalAfter).toBe(verticalBefore - 40)
  })

  it('拖端口腿：折长不足最小段长时按拖动方向推离端口', () => {
    const moved = moveEdgeSegment(zPoints, 0, 'y', 182)
    expect(moved[2]).toEqual({ x: 316, y: 200 })
  })

  it('把被拖段拖回端口所在坐标 → 折自动消失（可逆）', () => {
    const moved = moveEdgeSegment(zPoints, 0, 'y', 220)
    const collapsed = normalizeOrthogonalPoints(moveEdgeSegment(moved, 2, 'y', 180))
    expect(collapsed).toEqual(zPoints)
  })

  it('端口旁固定小段不给手柄（短于阈值），长端口腿仍可拖', () => {
    const withFixedStub = [
      { x: 340, y: 180 },
      { x: 316, y: 180 },
      { x: 316, y: 190 },
      { x: 260, y: 190 },
      { x: 260, y: 300 },
      { x: 180, y: 300 },
    ]
    const handles = edgeSegmentHandles(withFixedStub)
    // 端口旁固定小段（24 < 32）无手柄；其余段（含长端口腿）都有
    expect(handles.some((handle) => handle.index === 0)).toBe(false)
    expect(handles.map((handle) => handle.index)).toEqual([1, 2, 3, 4])
    expect(edgeSegmentHandles(zPoints).map((handle) => handle.index)).toEqual([0, 1, 2])
  })
})

describe('BF20261013-031 直线可拖 / 端口外向夹取 / 端口对齐不绷直', () => {
  it('整条直线给出合成中点手柄（垂直→左右拖，水平→上下拖）', () => {
    expect(
      edgeSegmentHandles([
        { x: 100, y: 300 },
        { x: 100, y: 600 },
      ]),
    ).toEqual([
      {
        index: 0,
        x: 100,
        y: 450,
        orientation: 'v',
        axis: 'x',
        cursor: 'ew-resize',
        straight: true,
        port: null,
      },
    ])
    expect(
      edgeSegmentHandles([
        { x: 100, y: 300 },
        { x: 600, y: 300 },
      ]),
    ).toEqual([
      {
        index: 0,
        x: 350,
        y: 300,
        orientation: 'h',
        axis: 'y',
        cursor: 'ns-resize',
        straight: true,
        port: null,
      },
    ])
  })

  it('拖动直线生成滑移折返（jog）：两端端口腿仍垂直出入、跨度 40、滑移跟随指针', () => {
    const straight = [
      { x: 100, y: 300 },
      { x: 100, y: 600 },
    ]
    const jog = moveEdgeSegment(straight, 0, 'x', 200)
    expect(jog).toEqual([
      { x: 100, y: 300 },
      { x: 100, y: 430 },
      { x: 200, y: 430 },
      { x: 200, y: 470 },
      { x: 100, y: 470 },
      { x: 100, y: 600 },
    ])
    expectOrthogonalWithoutOverlap(jog)
    // 滑移量小于净空 → 推到净空边界（不塌缩到端口直线）
    expect(moveEdgeSegment(straight, 0, 'x', 105)[2]).toEqual({ x: 120, y: 430 })
    // 水平直线对称
    const horizontal = moveEdgeSegment(
      [
        { x: 100, y: 300 },
        { x: 600, y: 300 },
      ],
      0,
      'y',
      200,
    )
    expect(horizontal).toEqual([
      { x: 100, y: 300 },
      { x: 330, y: 300 },
      { x: 330, y: 200 },
      { x: 370, y: 200 },
      { x: 370, y: 300 },
      { x: 600, y: 300 },
    ])
    expectOrthogonalWithoutOverlap(horizontal)
    // 线路过短容不下折返 → 原样返回（同一引用）
    const short = [
      { x: 100, y: 300 },
      { x: 100, y: 340 },
    ]
    expect(moveEdgeSegment(short, 0, 'x', 200)).toBe(short)
  })

  it('jog 内段可越过端口直线（四向可拖动），仅禁止塌缩', () => {
    const jog = moveEdgeSegment(
      [
        { x: 100, y: 300 },
        { x: 100, y: 600 },
      ],
      0,
      'x',
      200,
    )
    // 越过端口直线到另一侧：允许
    expect(moveEdgeSegment(jog, 2, 'x', 50)[2]).toEqual({ x: 50, y: 430 })
    // 拖到端口直线坐标 → 该段折叠（jog 退化为直线，可逆），不再推离
    expect(normalizeOrthogonalPoints(moveEdgeSegment(jog, 2, 'x', 100))).toEqual([
      { x: 100, y: 300 },
      { x: 100, y: 600 },
    ])
    // 上下段（jog 第 1/3 段）夹取在两端净空内
    expect(moveEdgeSegment(jog, 1, 'y', 100)[1]).toEqual({ x: 100, y: 320 })
    expect(moveEdgeSegment(jog, 3, 'y', 900)[4]).toEqual({ x: 100, y: 580 })
    for (let value = -100; value <= 700; value += 23) {
      expectOrthogonalWithoutOverlap(moveEdgeSegment(jog, 2, 'x', value))
    }
  })

  it('端口腿夹取以端口几何外向为准：节点移动后的「错位」不再只能单向拖', () => {
    // 审批底边端口 (884,602) 外向 +y；结束顶边端口 (1004,761) 外向 -y；
    // 中段已被拖到 764（在终点端口下方）——旧口径按折线方向锁成只能向下
    const misaligned = [
      { x: 884, y: 602 },
      { x: 884, y: 764 },
      { x: 1004, y: 764 },
      { x: 1004, y: 761 },
    ]
    expect(moveEdgeSegment(misaligned, 1, 'y', 700)[1].y).toBe(781)
    expect(
      moveEdgeSegment(misaligned, 1, 'y', 700, { sourceOutward: 1, targetOutward: -1 })[1].y,
    ).toBe(700)
    expect(
      moveEdgeSegment(misaligned, 1, 'y', 800, { sourceOutward: 1, targetOutward: -1 })[1].y,
    ).toBe(741)
    expect(
      moveEdgeSegment(misaligned, 1, 'y', 600, { sourceOutward: 1, targetOutward: -1 })[1].y,
    ).toBe(622)
  })

  it('自动路由（无拐点）移动节点后仍无拐点：默认路由随节点位置重算', () => {
    const model = createDesignerModel(
      {
        processKey: 'bpm_auto',
        name: '自动路由',
        formKey: 'demo_form',
        version: 1,
        elements: [
          { id: 'node_a', kind: 'node', type: 'APPROVAL', x: 420, y: 180, config: {}, style: {} },
          { id: 'node_b', kind: 'node', type: 'END', x: 600, y: 300, config: {}, style: {} },
          { id: 'edge_1', kind: 'edge', source: 'node_a', target: 'node_b' },
        ],
        canvas: {},
      },
      { width: 160, height: 50 },
      22,
    )
    model.moveNode('node_b', 420, 300)
    expect(model.state().edges[0].waypoints).toEqual([])
    expect(model.state().edges[0].path).toBe('M 420 205 L 420 275')
    model.moveNode('node_b', 600, 300)
    expect(model.state().edges[0].waypoints).toEqual([])
    expect(model.state().edges[0].path).toBe('M 420 205 L 420 240 L 600 240 L 600 275')
  })

  it('端口对齐时保留滑移折返（不绷直成直线）', () => {
    const start = { x: 420, y: 205 }
    const end = { x: 420, y: 275 }
    const hint = { sourceAxis: 'v' as const, targetAxis: 'v' as const }
    const jogWaypoints = [
      { x: 420, y: 430 },
      { x: 200, y: 430 },
      { x: 200, y: 470 },
      { x: 420, y: 470 },
    ]
    expect(canonicalEdgeWaypoints(start, end, jogWaypoints, hint)).toEqual(jogWaypoints)
    expect(buildEdgePath(start, end, jogWaypoints, hint)).toBe(
      'M 420 205 L 420 430 L 200 430 L 200 470 L 420 470 L 420 275',
    )
    // 超长历史形状 + 端口对齐 → 重建为折返（不是直线）
    const snake: Array<{ x: number; y: number }> = []
    for (let i = 0; i < 12; i += 1) {
      snake.push({ x: 420 + (i % 2) * 140, y: 100 + i * 30 })
    }
    const rebuilt = canonicalEdgeWaypoints(start, end, snake, hint)
    expect(rebuilt.length).toBeGreaterThan(0)
    const path = buildEdgePath(start, end, rebuilt, hint)
    expect(path).not.toBe('M 420 205 L 420 275')
    expect(pathPoints(path).length - 1).toBeGreaterThan(1)
    expectOrthogonalWithoutOverlap(pathPoints(path))
  })
})

describe('createDesignerModel', () => {
  it('moveNode 后相连边 path 同步重算', () => {
    const model = createDesignerModel(baseGraph())
    model.moveNode('node_end', 700, 500)
    const edge = model.state().edges[0]
    // P53 设计（节点19）：边线连接节点边框端口（右缘中心 → 左缘中心）；
    // BF20261013-029：横平竖直曼哈顿路由（竖段居中）
    expect(edge.path).toBe('M 176 300 L 400 300 L 400 500 L 624 500')
  })

  it('节点与连线操作更新状态并标记脏', () => {
    const model = createDesignerModel(baseGraph())
    const spy = vi.fn()
    model.subscribe(spy)

    const newId = model.addNode('APPROVAL', '审批节点', 400, 300)
    expect(model.state().nodes).toHaveLength(3)
    expect(model.state().dirty).toBe(true)

    const edgeId = model.connect('node_start', newId)
    expect(edgeId).toBeTypeOf('string')

    model.select(edgeId)
    expect(model.state().selection).toBe(edgeId)
    model.removeSelection()
    expect(model.state().edges).toHaveLength(1)
    expect(spy).toBeTypeOf('function')
  })

  it('连接已存在边被拒绝；自环被拒绝', () => {
    const model = createDesignerModel(baseGraph())
    expect(model.connect('node_start', 'node_end')).toBeNull()
    expect(model.connect('node_start', 'node_start')).toBeNull()
  })

  it('V011-BUG-020：insertNodeOnEdge 在连线中间插入节点并替换为两段连线', () => {
    const model = createDesignerModel(baseGraph())
    const nodeId = model.insertNodeOnEdge('edge_1', 'APPROVAL', '审批', 400, 300)
    expect(nodeId).toBeTypeOf('string')
    const state = model.state()
    expect(state.nodes).toHaveLength(3)
    // 原连线拆除，替换为 源→新节点→目标 两条
    expect(state.edges).toHaveLength(2)
    // P62 FD01：两条新边 ID 必须互异（重复 ID 会导致 BPMN cvc-id.2 发布失败）
    expect(new Set(state.edges.map((e) => e.id)).size).toBe(2)
    expect(state.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort()).toEqual([
      `${nodeId}->node_end`,
      'node_start->' + nodeId,
    ])
    expect(state.dirty).toBe(true)
    // 连线端点贴节点边框：源右缘 → 新节点左缘
    expect(state.edges.every((e) => e.path.startsWith('M '))).toBe(true)
  })

  it('insertNodeOnEdge 对不存在的连线返回 null', () => {
    const model = createDesignerModel(baseGraph())
    expect(model.insertNodeOnEdge('edge_missing', 'APPROVAL', '审批', 400, 300)).toBeNull()
  })

  it('P62 FD01：hitTestEdgeAtPoint 命中连线返回边 id，空白处返回 null，多边取最近', () => {
    const model = createDesignerModel(baseGraph())
    const state = model.state()
    // START(100,300)→END(700,300) 的中点 (400,300) 命中唯一连线
    expect(hitTestEdgeAtPoint(state.nodes, state.edges, 400, 300)).toBe('edge_1')
    // 容差外空白点不命中
    expect(hitTestEdgeAtPoint(state.nodes, state.edges, 400, 500)).toBeNull()
    // 插入审批节点后：可见连线上仍命中（BF031 起按真实渲染折线判定）
    model.insertNodeOnEdge('edge_1', 'APPROVAL', '审批', 400, 300)
    const after = model.state()
    const hit = hitTestEdgeAtPoint(after.nodes, after.edges, 250, 300)
    expect(hit).not.toBeNull()
    const hitEdge = after.edges.find((candidate) => candidate.id === hit)
    expect(hitEdge).toBeDefined()
    // 节点盒内（画布中心）不是连线（旧口径按源-目标直连虚位会误命中）
    expect(hitTestEdgeAtPoint(after.nodes, after.edges, 400, 300)).toBeNull()
  })

  it('BF20261013-031：命中检测按真实渲染折线（自动路由折线可命中，直连虚位不命中）', () => {
    const model = createDesignerModel(
      {
        processKey: 'bpm_hit',
        name: '命中',
        formKey: 'demo_form',
        version: 1,
        elements: [
          { id: 'node_a', kind: 'node', type: 'APPROVAL', x: 420, y: 180, config: {}, style: {} },
          { id: 'node_b', kind: 'node', type: 'END', x: 600, y: 300, config: {}, style: {} },
          { id: 'edge_1', kind: 'edge', source: 'node_a', target: 'node_b' },
        ],
        canvas: {},
      },
      { width: 160, height: 50 },
      22,
    )
    const state = model.state()
    // 渲染折线 M 420 205 L 420 240 L 600 240 L 600 275：首段（x=420）上命中
    expect(state.edges[0].path).toBe('M 420 205 L 420 240 L 600 240 L 600 275')
    expect(hitTestEdgeAtPoint(state.nodes, state.edges, 420, 220)).toBe('edge_1')
    // 源-目标中心直连虚位（无可见连线）不命中
    expect(hitTestEdgeAtPoint(state.nodes, state.edges, 470, 213)).toBeNull()
  })

  it('P62 FD01：点击添加命中连线时与拖放同语义插入（addNode 路径不再产生断连节点）', () => {
    const model = createDesignerModel(baseGraph())
    const state = model.state()
    const edgeId = hitTestEdgeAtPoint(state.nodes, state.edges, 400, 300)
    expect(edgeId).toBe('edge_1')
    model.insertNodeOnEdge(edgeId as string, 'APPROVAL', '审批', 400, 300)
    const after = model.state()
    // 图中每个节点都连通：无孤立节点（每个节点至少出现在一条边上）
    const touched = new Set<string>()
    for (const edge of after.edges) {
      touched.add(edge.sourceId)
      touched.add(edge.targetId)
    }
    for (const node of after.nodes) {
      expect(touched.has(node.id)).toBe(true)
    }
  })

  it('V011-BUG-025：setEdgeEndpoint 改接端点重算 path；自环/重复边拒绝', () => {
    const model = createDesignerModel(baseGraph())
    const extraId = model.addNode('APPROVAL', '审批', 400, 500)
    expect(model.setEdgeEndpoint('edge_1', 'target', extraId)).toBe('edge_1')
    const state = model.state()
    const edge = state.edges.find((candidate) => candidate.id === 'edge_1')
    expect(edge?.sourceId).toBe('node_start')
    expect(edge?.targetId).toBe(extraId)
    expect(edge?.path.startsWith('M ')).toBe(true)
    // 自环禁止：源改接为目标同节点
    expect(model.setEdgeEndpoint('edge_1', 'source', extraId)).toBeNull()
    // 改回原对（此时无重复）合法，用于构造重复场景
    expect(model.setEdgeEndpoint('edge_1', 'target', 'node_end')).toBe('edge_1')
    expect(model.connect('node_start', extraId)).not.toBeNull()
    expect(model.setEdgeEndpoint('edge_1', 'target', extraId)).toBeNull()
  })

  it('删除节点连带删除相连边；undo 恢复', () => {
    const model = createDesignerModel(baseGraph())
    const approvalId = model.addNode('APPROVAL', '第二审批', 400, 300)
    model.connect('node_start', approvalId)
    model.connect(approvalId, 'node_end')
    expect(model.state().edges).toHaveLength(3)

    model.select(approvalId)
    model.removeSelection()
    expect(model.state().nodes).toHaveLength(2)
    expect(model.state().edges).toHaveLength(1)

    model.undo()
    expect(model.state().nodes).toHaveLength(3)
    expect(model.state().edges).toHaveLength(3)
  })

  it('serialize 输出 I3 坐标契约（contractVersion=2、node x/y、edge source/target）', () => {
    const model = createDesignerModel(baseGraph())
    const approvalId = model.addNode('APPROVAL', '第二审批', 400, 300)
    model.connect('node_start', approvalId)
    const serialized = model.serialize()
    expect(serialized.contractVersion).toBe(2)
    const nodes = serialized.elements.filter((e) => e.kind === 'node')
    const edges = serialized.elements.filter((e) => e.kind === 'edge')
    expect(nodes.some((n) => n.id === approvalId && n.x === 400 && n.y === 300)).toBe(true)
    expect(edges.some((e) => e.source === 'node_start' && e.target === approvalId)).toBe(true)
  })

  it('undo 上限不超过 30 步', () => {
    const model = createDesignerModel(baseGraph())
    let lastId = 'node_start'
    for (let i = 0; i < 60; i++) {
      const id = model.addNode('APPROVAL', 'n' + i, 100 + i * 10, 400)
      void lastId
      lastId = id
    }
    let undos = 0
    while (model.canUndo()) {
      model.undo()
      undos++
    }
    expect(undos).toBeGreaterThanOrEqual(30)
    expect(undos).toBeLessThanOrEqual(31)
  })

  it('updateNodeConfig 合并既有键', () => {
    const model = createDesignerModel(baseGraph())
    const approvalId = model.addNode('APPROVAL', '审批', 400, 300)
    model.updateNodeConfig(approvalId, { disapprovePolicy: 'CONTINUE' })
    const node = model.state().nodes.find((n) => n.id === approvalId)
    expect(node?.config.name).toBe('审批')
    expect(node?.config.disapprovePolicy).toBe('CONTINUE')
  })
})

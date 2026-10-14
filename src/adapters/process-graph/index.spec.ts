import { describe, it, expect, vi } from 'vitest'
import {
  normalizeGraph,
  createDesignerModel,
  buildEdgePath,
  canonicalEdgeWaypoints,
  edgePortAxis,
  edgeSegmentHandles,
  expandEdgePathPoints,
  hitTestEdgeAtPoint,
  edgePortSlideSpan,
  moveEdgeSegment,
  normalizeOrthogonalPoints,
  pointsToWaypoints,
  portSlideCoordinate,
  portSlideOffset,
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

  it('贪吃蛇收敛：>5 段按端口朝向重建 3 段 Z（偏移取包围盒中心并夹取净空）', () => {
    const snake = [
      { x: 420, y: 100 },
      { x: 560, y: 100 },
      { x: 560, y: 400 },
      { x: 200, y: 400 },
      { x: 200, y: 150 },
    ]
    expect(expandEdgePathPoints(vhv.start, vhv.end, snake, vhv.hint).length - 1).toBeGreaterThan(5)
    const waypoints = canonicalEdgeWaypoints(vhv.start, vhv.end, snake, vhv.hint)
    expect(waypoints).toEqual([
      { x: 420, y: 250 },
      { x: 600, y: 250 },
    ])
    const path = buildEdgePath(vhv.start, vhv.end, waypoints, vhv.hint)
    expect(path).toBe('M 420 205 L 420 250 L 600 250 L 600 275')
    expectOrthogonalWithoutOverlap(pathPoints(path))
  })

  it('收敛后模型拐点与渲染同源（normalizeGraph 输出即收敛结果）', () => {
    const graph: ProcessGraphDocument = {
      processKey: 'bpm_snake',
      name: '蛇形收敛',
      formKey: 'demo_form',
      version: 1,
      elements: [
        { id: 'node_a', kind: 'node', type: 'APPROVAL', x: 420, y: 180, config: {}, style: {} },
        { id: 'node_b', kind: 'node', type: 'END', x: 600, y: 300, config: {}, style: {} },
        {
          id: 'edge_1',
          kind: 'edge',
          source: 'node_a',
          target: 'node_b',
          waypoints: [
            { x: 420, y: 100 },
            { x: 560, y: 100 },
            { x: 560, y: 400 },
            { x: 200, y: 400 },
            { x: 200, y: 150 },
          ],
        },
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

describe('BF20261013-032 每段可拖：端口沿边框滑动', () => {
  it('滑动量 ↔ 边框坐标（两端留净空、越界夹取）', () => {
    // 审批 160 宽：底边 x ∈ [340,500]，净空 16 → 可滑动 [356,484]
    expect(portSlideCoordinate(0.5, 340, 160)).toBe(420)
    expect(portSlideCoordinate(0, 340, 160)).toBe(356)
    expect(portSlideCoordinate(1, 340, 160)).toBe(484)
    expect(portSlideOffset(420, 340, 160)).toBe(0.5)
    expect(portSlideOffset(300, 340, 160)).toBe(0)
    expect(portSlideOffset(900, 340, 160)).toBe(1)
    expect(
      edgePortSlideSpan({ x: 420, y: 180, type: 'APPROVAL' }, 'bottom', {
        width: 160,
        height: 50,
      }),
    ).toEqual({ start: 340, length: 160 })
    expect(
      edgePortSlideSpan({ x: 420, y: 180, type: 'APPROVAL' }, 'right', {
        width: 160,
        height: 50,
      }),
    ).toEqual({ start: 155, length: 50 })
  })

  it('拖端口腿（滑动端口）后路由重建且仍严格横平竖直', () => {
    const model = createDesignerModel(
      {
        processKey: 'bpm_slide',
        name: '端口滑动',
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
    expect(model.state().edges[0].path).toBe('M 420 205 L 420 240 L 600 240 L 600 275')
    // 起点端口沿底边滑到 offset=0.25 → x = 356 + 0.25*128 = 388
    model.setEdgePortOffset('edge_1', 'source', 0.25)
    const edge = model.state().edges[0]
    expect(edge.path).toBe('M 388 205 L 388 240 L 600 240 L 600 275')
    expect(edge.config.sourceOffset).toBe(0.25)
    expectOrthogonalWithoutOverlap(pathPoints(edge.path))
    expect(model.state().dirty).toBe(true)
    // 序列化 → 重新加载后仍按滑动后的端口渲染（0..1 归一，随节点移动保持相对位置）
    const reloaded = normalizeGraph(model.serialize(), { width: 160, height: 50 }, 22)
    expect(reloaded.edges[0].path).toBe('M 388 205 L 388 240 L 600 240 L 600 275')
    // 终点端口滑到 END 顶边右端 → x = 536 + 128 = 664
    model.setEdgePortOffset('edge_1', 'target', 1)
    expect(model.state().edges[0].config.targetOffset).toBe(1)
    expect(model.state().edges[0].path).toBe('M 388 205 L 388 240 L 664 240 L 664 275')
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
    // 距端口直线不足净空 → 推离到 100+20
    expect(moveEdgeSegment(jog, 2, 'x', 110)[2]).toEqual({ x: 120, y: 430 })
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
    // 历史超长蛇形 + 端口对齐 → 重建为折返（不是直线）
    const snake = [
      { x: 420, y: 100 },
      { x: 560, y: 100 },
      { x: 560, y: 400 },
      { x: 200, y: 400 },
      { x: 200, y: 150 },
    ]
    const rebuilt = canonicalEdgeWaypoints(start, end, snake, hint)
    expect(rebuilt.length).toBeGreaterThan(0)
    const path = buildEdgePath(start, end, rebuilt, hint)
    expect(path).toBe('M 420 205 L 420 225 L 380 225 L 380 255 L 420 255 L 420 275')
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

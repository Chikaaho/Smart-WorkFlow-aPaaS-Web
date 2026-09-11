import { describe, it, expect, vi } from 'vitest'
import { normalizeGraph, createDesignerModel, buildEdgePath } from './index'
import type { ProcessGraphDocument } from '@/contracts/process-graph'

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
  it('生成 M/L 折线命令', () => {
    const path = buildEdgePath({ x: 0, y: 0 }, { x: 100, y: 100 }, [{ x: 50, y: 0 }])
    expect(path).toBe('M 0 0 L 50 0 L 100 100')
  })
})

describe('createDesignerModel', () => {
  it('moveNode 后相连边 path 同步重算', () => {
    const model = createDesignerModel(baseGraph())
    model.moveNode('node_end', 700, 500)
    const edge = model.state().edges[0]
    expect(edge.path).toBe('M 100 300 L 700 500')
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

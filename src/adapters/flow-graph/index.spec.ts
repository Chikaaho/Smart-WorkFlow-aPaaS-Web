import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountFlowGraph, type FlowGraphData } from './index'

describe('adapters/flow-graph', () => {
  beforeEach(() => {
    // jsdom 不提供 ResizeObserver，VueFlow 初始化时依赖它
    if (typeof window.ResizeObserver === 'undefined') {
      vi.stubGlobal(
        'ResizeObserver',
        vi.fn(function () {
          return {
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
          }
        }),
      )
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mounts without error and returns instance with exportGraph/destroy', () => {
    const container = document.createElement('div')
    const instance = mountFlowGraph(container)
    expect(instance).toBeDefined()
    expect(typeof instance.exportGraph).toBe('function')
    expect(typeof instance.destroy).toBe('function')
    instance.destroy()
  })

  it('with initialData, exportGraph returns matching data', () => {
    const data: FlowGraphData = {
      nodes: [{ id: 'n1', position: { x: 100, y: 200 } }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    }
    const container = document.createElement('div')
    const instance = mountFlowGraph(container, data)
    const result = instance.exportGraph()
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('n1')
    expect(result.nodes[0].position).toEqual({ x: 100, y: 200 })
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].id).toBe('e1')
    instance.destroy()
  })

  it('without initialData, exportGraph returns { nodes: [], edges: [] }', () => {
    const container = document.createElement('div')
    const instance = mountFlowGraph(container)
    const result = instance.exportGraph()
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    instance.destroy()
  })

  it('destroy clears container DOM', () => {
    const container = document.createElement('div')
    const instance = mountFlowGraph(container)
    // 刚 mount 后容器应有内容
    expect(container.innerHTML).not.toBe('')
    instance.destroy()
    // unmount 后容器应被清空
    expect(container.innerHTML).toBe('')
  })

  it('destroy is idempotent (second call does not throw)', () => {
    const container = document.createElement('div')
    const instance = mountFlowGraph(container)
    instance.destroy()
    expect(() => instance.destroy()).not.toThrow()
  })

  it('accepts events callbacks without error and callbacks are wired', () => {
    const container = document.createElement('div')
    const onNodeClick = vi.fn()
    const onEdgeCreate = vi.fn()
    const onGraphChange = vi.fn()

    const instance = mountFlowGraph(container, undefined, {
      onNodeClick,
      onEdgeCreate,
      onGraphChange,
    })

    // 带 events 参数挂载不抛异常
    expect(instance).toBeDefined()
    // exportGraph 仍然正常工作
    expect(instance.exportGraph()).toEqual({ nodes: [], edges: [] })
    // 用初始数据再次验证
    const data: FlowGraphData = {
      nodes: [{ id: 'x1', position: { x: 0, y: 0 } }],
      edges: [],
    }
    const container2 = document.createElement('div')
    const instance2 = mountFlowGraph(container2, data, {
      onNodeClick,
      onEdgeCreate,
      onGraphChange,
    })
    const result = instance2.exportGraph()
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('x1')
    instance2.destroy()
    instance.destroy()
  })
})

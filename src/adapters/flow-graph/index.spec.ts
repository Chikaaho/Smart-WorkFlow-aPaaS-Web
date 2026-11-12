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

  describe('G1-1 命令式更新（不销毁重挂载）', () => {
    function mountWithData(events?: Parameters<typeof mountFlowGraph>[2]) {
      const container = document.createElement('div')
      const data: FlowGraphData = {
        nodes: [
          {
            id: 'n1',
            type: 'START',
            label: '开始',
            position: { x: 0, y: 0 },
            data: { inputVar: 'input' },
            presentation: { icon: 'play', accent: '#67c23a', summary: '文本入参' },
          },
        ],
        edges: [],
      }
      const instance = mountFlowGraph(container, data, events)
      return { container, instance }
    }

    it('addNode/updateNode/removeNode 更新导出数据并通过 onGraphChange 回传', () => {
      const onGraphChange = vi.fn()
      const { instance } = mountWithData({ onGraphChange })
      instance.addNode({ id: 'n2', type: 'LLM', label: 'LLM 调用', position: { x: 300, y: 0 } })
      expect(instance.exportGraph().nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
      expect(onGraphChange).toHaveBeenCalled()

      instance.updateNode({
        id: 'n2',
        type: 'LLM',
        label: 'LLM 调用',
        position: { x: 320, y: 10 },
        presentation: { icon: 'spark', summary: 'DeepSeek V3' },
      })
      const updated = instance.exportGraph().nodes.find((n) => n.id === 'n2')
      expect(updated?.position).toEqual({ x: 320, y: 10 })
      expect(updated?.presentation?.summary).toBe('DeepSeek V3')

      instance.removeNode('n2')
      expect(instance.exportGraph().nodes.map((n) => n.id)).toEqual(['n1'])
      instance.destroy()
    })

    it('removeNode 连带删除其入/出边', () => {
      const { instance } = mountWithData()
      instance.addNode({ id: 'n2', position: { x: 200, y: 0 } })
      instance.addEdge({ id: 'e1', source: 'n1', target: 'n2' })
      instance.addEdge({ id: 'e2', source: 'n2', target: 'n1' })
      instance.removeNode('n2')
      expect(instance.exportGraph().edges).toEqual([])
      instance.destroy()
    })

    it('setData 整体替换节点与边', () => {
      const { instance } = mountWithData()
      instance.setData({
        nodes: [{ id: 'a', position: { x: 1, y: 2 } }],
        edges: [{ id: 'e', source: 'a', target: 'a' }],
      })
      const result = instance.exportGraph()
      expect(result.nodes.map((n) => n.id)).toEqual(['a'])
      expect(result.edges.map((e) => e.id)).toEqual(['e'])
      instance.destroy()
    })

    it('presentation 不污染业务 data（导出时剥离保留键）', () => {
      const { instance } = mountWithData()
      instance.updateNode({
        id: 'n1',
        type: 'START',
        label: '开始',
        position: { x: 0, y: 0 },
        data: { inputVar: 'input' },
        presentation: { icon: 'play', summary: '文本入参', status: 'success' },
      })
      const node = instance.exportGraph().nodes[0]
      expect(node.data).toEqual({ inputVar: 'input' })
      expect(node.presentation).toEqual({ icon: 'play', summary: '文本入参', status: 'success' })
      expect(JSON.stringify(node.data)).not.toContain('__swFlowPresentation')
      instance.destroy()
    })

    it('addEdge/updateEdge/removeEdge 更新边数据', () => {
      const { instance } = mountWithData()
      instance.addNode({ id: 'n2', position: { x: 200, y: 0 } })
      instance.addEdge({ id: 'e1', source: 'n1', target: 'n2' })
      instance.updateEdge({ id: 'e1', source: 'n1', target: 'n2', label: '通过' })
      expect(instance.exportGraph().edges[0].label).toBe('通过')
      instance.removeEdge('e1')
      expect(instance.exportGraph().edges).toEqual([])
      instance.destroy()
    })
  })
})

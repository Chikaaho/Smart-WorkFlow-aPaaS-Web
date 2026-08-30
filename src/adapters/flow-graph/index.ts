/**
 * @vue-flow/core 的防腐层。原生 API 只允许在本文件内出现，业务层只认下方导出的我方契约。
 */
import { createApp, defineComponent, h, ref, type App as VueApp } from 'vue'
import { VueFlow, type Node as VFNode, type Edge as VFEdge, type Connection } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'

/* ------------------------------------------------------------------ */
/*  对外契约：业务层只消费这些类型和函数                                  */
/* ------------------------------------------------------------------ */

export interface FlowGraphNode {
  id: string
  type?: string
  label?: string
  position: { x: number; y: number }
  data?: Record<string, unknown>
}

export interface FlowGraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface FlowGraphData {
  nodes: FlowGraphNode[]
  edges: FlowGraphEdge[]
}

export interface FlowGraphEvents {
  onNodeClick?: (node: FlowGraphNode) => void
  onEdgeCreate?: (edge: FlowGraphEdge) => void
  onGraphChange?: (data: FlowGraphData) => void
}

export interface FlowGraphInstance {
  exportGraph(): FlowGraphData
  destroy(): void
}

/* ------------------------------------------------------------------ */
/*  内部类型转换：@vue-flow/core 原生类型 ← 我方契约                      */
/* ------------------------------------------------------------------ */

function toFlowGraphNode(node: VFNode): FlowGraphNode {
  return {
    id: node.id,
    type: node.type,
    label: typeof node.label === 'string' ? node.label : undefined,
    position: { x: node.position.x, y: node.position.y },
    data: node.data as Record<string, unknown> | undefined,
  }
}

function toFlowGraphEdge(edge: VFEdge): FlowGraphEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: typeof edge.label === 'string' ? edge.label : undefined,
  }
}

/* ------------------------------------------------------------------ */
/*  主入口                                                              */
/* ------------------------------------------------------------------ */

export function mountFlowGraph(
  container: HTMLElement,
  initialData?: FlowGraphData,
  events?: FlowGraphEvents,
): FlowGraphInstance {
  const nodes = ref<FlowGraphNode[]>(initialData?.nodes ?? [])
  const edges = ref<FlowGraphEdge[]>(initialData?.edges ?? [])
  let destroyed = false
  let app: VueApp | null = null

  const Wrapper = defineComponent({
    setup() {
      function handleNodeClick(event: { node: VFNode }) {
        events?.onNodeClick?.(toFlowGraphNode(event.node))
      }

      function handleConnect(connection: Connection) {
        const newEdge: FlowGraphEdge = {
          id: `vf-${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
        }
        edges.value = [...edges.value, newEdge]
        events?.onEdgeCreate?.(newEdge)
        events?.onGraphChange?.({ nodes: nodes.value, edges: edges.value })
      }

      function handleUpdateNodes(newNodes: VFNode[]) {
        nodes.value = newNodes.map(toFlowGraphNode)
        events?.onGraphChange?.({ nodes: nodes.value, edges: edges.value })
      }

      function handleUpdateEdges(newEdges: VFEdge[]) {
        edges.value = newEdges.map(toFlowGraphEdge)
        events?.onGraphChange?.({ nodes: nodes.value, edges: edges.value })
      }

      return () =>
        h(VueFlow, {
          nodes: nodes.value.map((n) => ({
            id: n.id,
            type: n.type,
            label: n.label,
            position: n.position,
            data: n.data,
          })),
          edges: edges.value.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label,
          })),
          fitViewOnInit: true,
          onNodeClick: handleNodeClick,
          onConnect: handleConnect,
          'onUpdate:nodes': handleUpdateNodes,
          'onUpdate:edges': handleUpdateEdges,
        })
    },
  })

  app = createApp(Wrapper)
  app.mount(container)

  return {
    exportGraph(): FlowGraphData {
      return {
        nodes: nodes.value.map((n) => ({ ...n })),
        edges: edges.value.map((e) => ({ ...e })),
      }
    },
    destroy(): void {
      if (destroyed) return
      destroyed = true
      if (app) {
        app.unmount()
        app = null
      }
    },
  }
}

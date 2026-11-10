/**
 * @vue-flow/core 的防腐层。原生 API 只允许在本文件内出现，业务层只认下方导出的我方契约。
 */
import { createApp, defineComponent, h, ref, type App as VueApp } from 'vue'
import { VueFlow, type Node as VFNode, type Edge as VFEdge, type Connection } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import './node-theme.css'

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

function toFlowGraphNode(node: VFNode, businessType?: string): FlowGraphNode {
  return {
    id: node.id,
    // 渲染层用 default 承载业务节点类型，事件/导出必须还原业务类型
    type: businessType ?? node.type,
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
  // 业务类型 ↔ vf 节点的还原表：vue-flow 事件里拿不到被替换前的类型
  const businessTypeById = new Map<string, string>()
  let destroyed = false
  let app: VueApp | null = null

  const Wrapper = defineComponent({
    setup() {
      function handleNodeClick(event: { node: VFNode }) {
        events?.onNodeClick?.(toFlowGraphNode(event.node, businessTypeById.get(event.node.id)))
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
        nodes.value = newNodes.map((n) => toFlowGraphNode(n, businessTypeById.get(n.id)))
        events?.onGraphChange?.({ nodes: nodes.value, edges: edges.value })
      }

      function handleUpdateEdges(newEdges: VFEdge[]) {
        edges.value = newEdges.map(toFlowGraphEdge)
        events?.onGraphChange?.({ nodes: nodes.value, edges: edges.value })
      }

      return () =>
        h(VueFlow, {
          nodes: nodes.value.map((n) => {
            // 业务节点类型（START/LLM/CONDITION…）不是 vue-flow 内置类型：
            // 未注册类型回退渲染会报错，统一用 default 节点承载，
            // 类型通过 vf-node-<type> class 表达（node-theme.css 按类型着色）。
            const type = n.type
            const builtIn = type === 'input' || type === 'output' || type === 'default'
            if (type && !builtIn) businessTypeById.set(n.id, type)
            return {
              id: n.id,
              type: builtIn ? type : 'default',
              label: n.label,
              position: n.position,
              data: n.data,
              class: type ? `vf-node-${type.toLowerCase()}` : undefined,
            }
          }),
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

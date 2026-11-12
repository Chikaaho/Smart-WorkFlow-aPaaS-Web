/**
 * @vue-flow/core 的防腐层（G1-1 扩展）。
 *
 * 原生 API 只允许在本包内出现，业务层只认这里导出的我方契约：
 * - 自定义节点卡片（NodeCard.vue）与自定义连线（EdgeWithInsert.vue）由适配层内置，
 *   业务层通过 FlowGraphNode.presentation 提供图标/摘要/状态等展示元数据；
 * - 命令式实例方法（setData/addNode/updateNode/removeNode/…）直接更新画布，
 *   不再每次结构变更都销毁重挂载；
 * - 事件面扩展：节点点击、边点击、空白点击、拖拽结束、连线创建、视图缩放、「+」插入。
 *
 * I48（flow-graph 契约限制）在 1.1.0 已按本文件扩展，见 known-issues。
 */
import { createApp, defineComponent, h, ref, type App as VueApp } from 'vue'
import {
  Position,
  VueFlow,
  useVueFlow,
  type Node as VFNode,
  type Edge as VFEdge,
  type Connection,
  type NodeComponent,
  type EdgeComponent,
  type NodeTypesObject,
  type EdgeTypesObject,
} from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import './node-theme.css'
import NodeCard from './NodeCard.vue'
import EdgeWithInsert from './EdgeWithInsert.vue'
import {
  FLOW_PRESENTATION_KEY,
  type FlowGraphData,
  type FlowGraphEdge,
  type FlowGraphEvents,
  type FlowGraphFitViewOptions,
  type FlowGraphInstance,
  type FlowGraphNode,
} from './types'

export type {
  FlowGraphData,
  FlowGraphEdge,
  FlowGraphEvents,
  FlowGraphFitViewOptions,
  FlowGraphInstance,
  FlowGraphNode,
  FlowInsertTarget,
  FlowNodePresentation,
  FlowNodeStatus,
} from './types'
export { FLOW_PRESENTATION_KEY } from './types'

/* ------------------------------------------------------------------ */
/*  内部转换：@vue-flow/core 原生类型 ↔ 我方契约                          */
/* ------------------------------------------------------------------ */

/** 业务类型 ↔ vf 节点的还原表（渲染层统一用 default 承载业务节点类型） */
type BusinessTypeMap = Map<string, string>

function stripPresentation(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return undefined
  if (!(FLOW_PRESENTATION_KEY in data)) return { ...data }
  const next = { ...data }
  delete next[FLOW_PRESENTATION_KEY]
  return Object.keys(next).length > 0 ? next : undefined
}

function toFlowGraphNode(node: VFNode, businessType?: string): FlowGraphNode {
  const rawData = node.data as Record<string, unknown> | undefined
  const presentation = rawData?.[FLOW_PRESENTATION_KEY]
  return {
    id: node.id,
    // 渲染层用 default 承载业务节点类型，事件/导出必须还原业务类型
    type: businessType ?? node.type,
    label: typeof node.label === 'string' ? node.label : undefined,
    position: { x: node.position.x, y: node.position.y },
    data: stripPresentation(rawData),
    presentation:
      presentation && typeof presentation === 'object'
        ? (presentation as FlowGraphNode['presentation'])
        : undefined,
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

function toVfNode(node: FlowGraphNode, businessTypeById: BusinessTypeMap): VFNode {
  const type = node.type
  const builtIn = type === 'input' || type === 'output' || type === 'default'
  if (type && !builtIn) businessTypeById.set(node.id, type)
  const data: Record<string, unknown> = { ...(node.data ?? {}) }
  if (node.presentation) {
    data[FLOW_PRESENTATION_KEY] = node.presentation
  }
  return {
    id: node.id,
    // 业务节点类型统一由 default 卡片承载（自定义卡片按 presentation 渲染）
    type: 'default',
    label: node.label,
    position: node.position,
    data: Object.keys(data).length > 0 ? data : undefined,
    // W-a2：流程按左→右阅读，连线从源节点右侧接目标节点左侧，避免上下绕弧
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }
}

function toVfEdge(edge: FlowGraphEdge): VFEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'default',
  }
}

function cloneNode(node: FlowGraphNode): FlowGraphNode {
  return {
    ...node,
    position: { ...node.position },
    data: node.data ? { ...node.data } : undefined,
    presentation: node.presentation ? { ...node.presentation } : undefined,
  }
}

function cloneEdge(edge: FlowGraphEdge): FlowGraphEdge {
  return { ...edge }
}

const NODE_TYPES: NodeTypesObject = { default: NodeCard as unknown as NodeComponent }
const EDGE_TYPES: EdgeTypesObject = { default: EdgeWithInsert as unknown as EdgeComponent }

/* ------------------------------------------------------------------ */
/*  主入口                                                              */
/* ------------------------------------------------------------------ */

export function mountFlowGraph(
  container: HTMLElement,
  initialData?: FlowGraphData,
  events?: FlowGraphEvents,
): FlowGraphInstance {
  const nodes = ref<FlowGraphNode[]>((initialData?.nodes ?? []).map(cloneNode))
  const edges = ref<FlowGraphEdge[]>((initialData?.edges ?? []).map(cloneEdge))
  const businessTypeById: BusinessTypeMap = new Map()
  let destroyed = false
  let app: VueApp | null = null
  let currentZoom = 1
  // 画布实例能力：在 Wrapper setup 内捕获（useVueFlow 只能在 setup 中取 store）
  let fitViewFn: ((options?: FlowGraphFitViewOptions) => void) | null = null
  let zoomInFn: (() => void) | null = null
  let zoomOutFn: (() => void) | null = null
  let zoomToFn: ((zoom: number) => void) | null = null

  function exportGraph(): FlowGraphData {
    return {
      nodes: nodes.value.map(cloneNode),
      edges: edges.value.map(cloneEdge),
    }
  }

  function emitChange() {
    events?.onGraphChange?.(exportGraph())
  }

  function handleConnect(connection: Connection) {
    const newEdge: FlowGraphEdge = {
      id: `vf-${connection.source}-${connection.target}-${Date.now()}`,
      source: connection.source,
      target: connection.target,
    }
    edges.value = [...edges.value, newEdge]
    events?.onEdgeCreate?.(newEdge)
    emitChange()
  }

  const insertActions = {
    insertAfter: (target: { kind: 'node' | 'edge'; id: string }) => {
      events?.onInsertAfter?.(target)
    },
  }

  const Wrapper = defineComponent({
    setup() {
      const store = useVueFlow()
      fitViewFn = (options?: FlowGraphFitViewOptions) => {
        void store.fitView({
          padding: options?.padding ?? 0.16,
          duration: options?.duration ?? 200,
        })
      }
      zoomInFn = () => {
        void store.zoomIn({ duration: 150 })
      }
      zoomOutFn = () => {
        void store.zoomOut({ duration: 150 })
      }
      zoomToFn = (zoom: number) => {
        void store.zoomTo(zoom, { duration: 150 })
      }
      store.onViewportChange((viewport) => {
        currentZoom = viewport.zoom
        events?.onViewportChange?.(viewport.zoom)
      })
      store.onNodeClick(({ node }) => {
        events?.onNodeClick?.(toFlowGraphNode(node, businessTypeById.get(node.id)))
      })
      store.onEdgeClick(({ edge }) => {
        events?.onEdgeClick?.(toFlowGraphEdge(edge))
      })
      store.onPaneClick(() => {
        events?.onPaneClick?.()
      })
      store.onNodeDragStop(() => {
        // 拖拽结束后把最新坐标同步给业务层（拖拽过程不逐帧回写）
        syncNodesFromStore(store.getNodes.value)
        emitChange()
      })

      return () =>
        h(VueFlow, {
          nodes: nodes.value.map((n) => toVfNode(n, businessTypeById)),
          edges: edges.value.map(toVfEdge),
          nodeTypes: NODE_TYPES,
          edgeTypes: EDGE_TYPES,
          fitViewOnInit: true,
          // W-a2：整图自动适配；节点基础字号在 node-theme.css 放大，保证 fit 后渲染 ≥12px
          maxZoom: 2,
          minZoom: 0.2,
          elevateEdgesOnSelect: true,
          onConnect: handleConnect,
          'onUpdate:nodes': (vfNodes: VFNode[]) => {
            nodes.value = vfNodes.map((n) => toFlowGraphNode(n, businessTypeById.get(n.id)))
            emitChange()
          },
          'onUpdate:edges': (vfEdges: VFEdge[]) => {
            edges.value = vfEdges.map(toFlowGraphEdge)
            emitChange()
          },
        })
    },
  })

  /** vf 内部 store 的节点坐标 → 业务节点（拖拽结束同步用） */
  function syncNodesFromStore(storeNodes: VFNode[]) {
    const positionById = new Map(storeNodes.map((n) => [n.id, n.position]))
    nodes.value = nodes.value.map((n) => {
      const position = positionById.get(n.id)
      return position ? { ...n, position: { x: position.x, y: position.y } } : n
    })
  }

  app = createApp(Wrapper)
  app.provide('sw-flow-actions', insertActions)
  app.mount(container)

  const instance: FlowGraphInstance = {
    exportGraph,
    setData(data: FlowGraphData) {
      nodes.value = (data.nodes ?? []).map(cloneNode)
      edges.value = (data.edges ?? []).map(cloneEdge)
      emitChange()
    },
    addNode(node: FlowGraphNode) {
      nodes.value = [...nodes.value, cloneNode(node)]
      emitChange()
    },
    updateNode(node: FlowGraphNode) {
      nodes.value = nodes.value.map((n) => (n.id === node.id ? cloneNode(node) : n))
      emitChange()
    },
    removeNode(id: string) {
      nodes.value = nodes.value.filter((n) => n.id !== id)
      edges.value = edges.value.filter((e) => e.source !== id && e.target !== id)
      emitChange()
    },
    addEdge(edge: FlowGraphEdge) {
      edges.value = [...edges.value, cloneEdge(edge)]
      emitChange()
    },
    updateEdge(edge: FlowGraphEdge) {
      edges.value = edges.value.map((e) => (e.id === edge.id ? cloneEdge(edge) : e))
      emitChange()
    },
    removeEdge(id: string) {
      edges.value = edges.value.filter((e) => e.id !== id)
      emitChange()
    },
    fitView(options?: FlowGraphFitViewOptions) {
      fitViewFn?.(options)
    },
    zoomIn() {
      zoomInFn?.()
    },
    zoomOut() {
      zoomOutFn?.()
    },
    setZoom(zoom: number) {
      zoomToFn?.(zoom)
    },
    getZoom() {
      return currentZoom
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
  return instance
}

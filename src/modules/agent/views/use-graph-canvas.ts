import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { mountFlowGraph } from '@/adapters/flow-graph'
import type {
  FlowGraphData,
  FlowGraphEdge,
  FlowGraphEvents,
  FlowGraphInstance,
  FlowGraphNode,
  FlowInsertTarget,
} from '@/adapters/flow-graph'
import {
  NODE_CONFIG_KEY_MAX_ITERATIONS,
  NODE_TYPE_START,
  nodeTypeLabel,
} from '@/modules/agent/utils/graphAdapter'
import {
  findFreePosition,
  layoutGraph,
  positionAfterNode,
  positionBetweenNodes,
} from '@/modules/agent/utils/graphLayout'
import {
  nodePresentation,
  nodePresentationReset,
  type NodePresentationContext,
} from '@/modules/agent/utils/node-presentation'
import { NODE_TYPES } from './graph-palette-config'

export interface GraphCanvasDeps {
  graphData: Ref<FlowGraphData>
  selectedNode: ComputedRef<FlowGraphNode | null>
  selectedNodeId: Ref<string | null>
  selectedEdgeId: Ref<string | null>
  canEdit: ComputedRef<boolean>
  /** 展示元数据上下文（选项就绪后经 refreshAllPresentations 刷新节点摘要） */
  presentationCtx: ComputedRef<NodePresentationContext>
}

/**
 * 画布编排：flow-graph 适配层实例与事件、快照历史（撤销/重做）、节点/连线命令式操作、
 * 属性面板写回、展示元数据（presentation）、缩放与整理布局、「+」插入对话框状态。
 * 结构变更全部走适配层命令式方法（不销毁重挂载画布）。
 */
export function useGraphCanvas(deps: GraphCanvasDeps) {
  const { t } = useI18n()
  const { graphData, selectedNode, selectedNodeId, selectedEdgeId, canEdit, presentationCtx } = deps

  // ─── 画布 ───
  const canvasRef = ref<HTMLElement | null>(null)
  const graphInstance = ref<FlowGraphInstance | null>(null)
  const zoom = ref(1)

  /** 供模板 :ref 绑定：把画布容器元素写入 canvasRef（挂载赋元素、卸载置 null，等价原字符串 ref）。 */
  function setCanvasRef(el: unknown): void {
    canvasRef.value = (el as HTMLElement | null) ?? null
  }

  // ─── 历史（撤销/重做） ───
  const history = ref<FlowGraphData[]>([])
  const historyIndex = ref(-1)

  // ─── 插入对话框 ───
  const insertDialogVisible = ref(false)
  const insertTarget = ref<FlowInsertTarget | null>(null)

  // ─── G1-7 节点运行状态 ───
  /** 运行状态由执行面写入；画布只负责把状态落到节点卡片 presentation。 */
  type NodeRunStatus = 'waiting' | 'running' | 'success' | 'failed' | 'skipped'

  /** 给节点补展示元数据（保留运行态 status） */
  function withPresentation(nodes: FlowGraphNode[]): FlowGraphNode[] {
    return nodes.map((node) => ({
      ...node,
      presentation: nodePresentation(node, presentationCtx.value, node.presentation?.status),
    }))
  }

  // ─── 历史 ───

  function cloneData(data: FlowGraphData): FlowGraphData {
    return JSON.parse(JSON.stringify(data)) as FlowGraphData
  }

  function pushHistory() {
    const snapshot = cloneData(graphData.value)
    history.value = history.value.slice(0, historyIndex.value + 1)
    history.value.push(snapshot)
    if (history.value.length > 50) history.value.shift()
    historyIndex.value = history.value.length - 1
  }

  /** 加载/恢复默认后重建历史基线。 */
  function resetHistory() {
    history.value = [cloneData(graphData.value)]
    historyIndex.value = 0
  }

  function applyHistory(index: number) {
    if (index < 0 || index >= history.value.length) return
    historyIndex.value = index
    const snapshot = cloneData(history.value[index])
    graphData.value = snapshot
    graphInstance.value?.setData({ nodes: snapshot.nodes, edges: snapshot.edges })
    selectedNodeId.value = selectedNodeId.value
      ? (snapshot.nodes.find((n) => n.id === selectedNodeId.value)?.id ?? null)
      : null
    selectedEdgeId.value = selectedEdgeId.value
      ? (snapshot.edges.find((e) => e.id === selectedEdgeId.value)?.id ?? null)
      : null
  }

  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  function undo() {
    if (canUndo.value) applyHistory(historyIndex.value - 1)
  }

  function redo() {
    if (canRedo.value) applyHistory(historyIndex.value + 1)
  }

  // ─── 画布事件 ───

  const graphEvents: FlowGraphEvents = {
    onNodeClick: (node: FlowGraphNode) => {
      selectedNodeId.value = node.id
      selectedEdgeId.value = null
    },
    onEdgeClick: (edge: FlowGraphEdge) => {
      selectedEdgeId.value = edge.id
      selectedNodeId.value = null
    },
    onPaneClick: () => {
      selectedNodeId.value = null
      selectedEdgeId.value = null
    },
    onGraphChange: (data: FlowGraphData) => {
      graphData.value = data
    },
    onNodeDragStop: () => {
      pushHistory()
    },
    onEdgeCreate: () => {
      pushHistory()
    },
    onInsertAfter: (target: FlowInsertTarget) => {
      // G1-9：只读模式不弹出插入对话框
      if (!canEdit.value) return
      insertTarget.value = target
      insertDialogVisible.value = true
    },
    onViewportChange: (value: number) => {
      zoom.value = value
    },
  }

  function mountCanvas() {
    graphInstance.value?.destroy()
    graphInstance.value = null
    if (!canvasRef.value) return
    graphData.value = {
      nodes: withPresentation(graphData.value.nodes),
      edges: graphData.value.edges,
    }
    graphInstance.value = mountFlowGraph(canvasRef.value, graphData.value, graphEvents)
  }

  // ─── 节点/连线操作 ───

  function genId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }

  function buildNode(type: string, position: { x: number; y: number }): FlowGraphNode {
    const node: FlowGraphNode = {
      id: genId('n'),
      type,
      label: nodeTypeLabel(type),
      position,
      data: {},
    }
    node.presentation = nodePresentation(node, presentationCtx.value)
    return node
  }

  /** 添加节点（palette 点击/拖入）：自动找不重叠空位，插入后选中 */
  function addNode(type: string, position?: { x: number; y: number }) {
    // G1-9：只读模式禁止改图
    if (!canEdit.value) return
    const target = position
      ? findFreePosition(graphData.value.nodes, position)
      : findFreePosition(graphData.value.nodes)
    const node = buildNode(type, target)
    graphInstance.value?.addNode(node)
    pushHistory()
    selectedNodeId.value = node.id
    selectedEdgeId.value = null
  }

  /** 删除节点（连带其入/出边）；START 不可删（执行契约要求唯一 START） */
  function removeSelectedNode() {
    const node = selectedNode.value
    if (!node) return
    if (node.type === NODE_TYPE_START) return
    graphInstance.value?.removeNode(node.id)
    pushHistory()
    selectedNodeId.value = null
  }

  /** 删除连线 */
  function removeEdge(edgeId: string) {
    graphInstance.value?.removeEdge(edgeId)
    pushHistory()
    if (selectedEdgeId.value === edgeId) selectedEdgeId.value = null
  }

  /**
   * 属性面板数据回写：写回业务 config，并刷新节点卡片摘要。
   * value 为 undefined 时删除键（config 不携带空值）。
   */
  function updateNodeData(key: string, value: unknown) {
    const node = selectedNode.value
    if (!node) return
    const data = { ...(node.data ?? {}) }
    if (value === undefined) {
      delete data[key]
    } else {
      data[key] = value
    }
    const next: FlowGraphNode = {
      ...node,
      data,
      presentation: nodePresentation({ ...node, data }, presentationCtx.value),
    }
    graphInstance.value?.updateNode(next)
    pushHistory()
  }

  /**
   * 变量名输入项写回：trim 后非空经 updateNodeData 写入 data（与后端 resolveVarName
   * 宽松语义对齐）；空白 = 未指定 = 默认变量，直接移除键。
   */
  function handleVarNameChange(key: string, value: unknown) {
    const name = String(value ?? '').trim()
    updateNodeData(key, name === '' ? undefined : name)
  }

  /**
   * LOOP maxIterations 写回（对齐后端契约：Integer ≥1，后端缺省默认 10）：
   * 空值/非数字删键；<1 或非整数提示且不写入。
   */
  function handleMaxIterationsChange(value: unknown) {
    const text = String(value ?? '').trim()
    if (text === '') {
      updateNodeData(NODE_CONFIG_KEY_MAX_ITERATIONS, undefined)
      return
    }
    const parsed = Number(text)
    if (Number.isNaN(parsed)) {
      updateNodeData(NODE_CONFIG_KEY_MAX_ITERATIONS, undefined)
      return
    }
    if (parsed < 1 || !Number.isInteger(parsed)) {
      ElMessage.warning(t('agent.loopMaxIterationsInvalid'))
      updateNodeData(NODE_CONFIG_KEY_MAX_ITERATIONS, undefined)
      return
    }
    updateNodeData(NODE_CONFIG_KEY_MAX_ITERATIONS, parsed)
  }

  /** 条件边关键词写回（空 = 默认边，删除 config.keyword 语义） */
  function handleKeywordChange(edge: FlowGraphEdge, value: unknown) {
    const keyword = String(value ?? '').trim()
    graphInstance.value?.updateEdge({ ...edge, label: keyword === '' ? undefined : keyword })
    pushHistory()
  }

  /** 连线属性面板关键词写回（选中连线路径） */
  function handleSelectedEdgeKeywordChange(value: unknown) {
    const selectedEdge = graphData.value.edges.find((e) => e.id === selectedEdgeId.value)
    if (!selectedEdge) return
    handleKeywordChange(selectedEdge, value)
  }

  function edgeDisplayName(edge: FlowGraphEdge): string {
    const from = graphData.value.nodes.find((n) => n.id === edge.source)
    const to = graphData.value.nodes.find((n) => n.id === edge.target)
    return `${from?.label ?? edge.source} → ${to?.label ?? edge.target}`
  }

  // ─── 「+」插入 ───

  function confirmInsert(type: string) {
    const target = insertTarget.value
    const instance = graphInstance.value
    if (!target || !instance) return
    const current = instance.exportGraph()
    if (target.kind === 'node') {
      const source = current.nodes.find((n) => n.id === target.id)
      if (!source) return
      const node = buildNode(type, positionAfterNode(source, current.nodes))
      instance.addNode(node)
      const outgoing = current.edges.filter((e) => e.source === source.id)
      if (outgoing.length === 1) {
        // 单出边：插在链路中间，保留原边关键词到「新节点→原目标」
        const oldEdge = outgoing[0]
        instance.removeEdge(oldEdge.id)
        instance.addEdge({ id: genId('e'), source: source.id, target: node.id })
        instance.addEdge({
          id: genId('e'),
          source: node.id,
          target: oldEdge.target,
          label: oldEdge.label,
        })
      } else {
        instance.addEdge({ id: genId('e'), source: source.id, target: node.id })
      }
      selectedNodeId.value = node.id
    } else {
      const edge = current.edges.find((e) => e.id === target.id)
      if (!edge) return
      const from = current.nodes.find((n) => n.id === edge.source)
      const to = current.nodes.find((n) => n.id === edge.target)
      const node = buildNode(type, positionBetweenNodes(from, to, current.nodes))
      instance.addNode(node)
      instance.removeEdge(edge.id)
      instance.addEdge({
        id: genId('e'),
        source: edge.source,
        target: node.id,
        label: edge.label,
      })
      instance.addEdge({ id: genId('e'), source: node.id, target: edge.target })
      selectedNodeId.value = node.id
    }
    selectedEdgeId.value = null
    insertDialogVisible.value = false
    insertTarget.value = null
    pushHistory()
  }

  const insertHint = computed(() => {
    const target = insertTarget.value
    if (!target) return ''
    if (target.kind === 'edge') return t('agent.insertIntoEdgeHint')
    const label = graphData.value.nodes.find((n) => n.id === target.id)?.label ?? target.id
    return t('agent.insertAfterNodeHint', { label })
  })

  const zoomPercent = computed(() => Math.round(zoom.value * 100))

  // ─── 画布拖放与视图 ───

  function onPaletteDragStart(type: string, event: DragEvent) {
    event.dataTransfer?.setData('text/plain', type)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  }

  function onCanvasDrop(event: DragEvent) {
    const type = event.dataTransfer?.getData('text/plain')
    if (!type || !NODE_TYPES.includes(type)) return
    event.preventDefault()
    const point = graphInstance.value?.screenToGraphPoint(event.clientX, event.clientY)
    addNode(type, point)
  }

  async function handleAutoLayout() {
    const laidOut = layoutGraph(graphData.value.nodes, graphData.value.edges)
    graphInstance.value?.setData({
      nodes: withPresentation(laidOut),
      edges: graphData.value.edges.map((e) => ({ ...e })),
    })
    // W4：整理后适配视口，避免首尾节点被画布边缘裁切
    await nextTick()
    graphInstance.value?.fitView({ padding: 0.2 })
    pushHistory()
  }

  function handleZoomIn() {
    graphInstance.value?.zoomIn()
  }

  function handleZoomOut() {
    graphInstance.value?.zoomOut()
  }

  function handleFitView() {
    graphInstance.value?.fitView()
  }

  /** 点击缩放百分比：精确恢复 100% */
  function resetZoom() {
    graphInstance.value?.setZoom(1)
  }

  // ─── G1-7 运行状态落到节点卡片 ───

  /** 把运行状态写到节点卡片（presentation.status → 适配层状态色；V2：未开始不标） */
  function applyNodeRunStatus(nodeId: string, status: NodeRunStatus | undefined) {
    const node = graphData.value.nodes.find((n) => n.id === nodeId)
    if (!node) return
    // undefined = 清除运行态（不回填旧状态），「等待人工」只留给真正暂停的 HUMAN 节点
    const presentation = status
      ? nodePresentation(node, presentationCtx.value, status)
      : nodePresentationReset(node, presentationCtx.value)
    graphInstance.value?.updateNode({ ...node, presentation })
  }

  /** 选项加载完成后刷新全部节点摘要（模型名/工具名/知识库名） */
  function refreshAllPresentations() {
    const instance = graphInstance.value
    if (!instance) return
    const current = instance.exportGraph()
    for (const node of current.nodes) {
      const source = graphData.value.nodes.find((n) => n.id === node.id) ?? node
      const presentation = nodePresentation(
        source,
        presentationCtx.value,
        node.presentation?.status,
      )
      if (JSON.stringify(presentation) !== JSON.stringify(node.presentation)) {
        instance.updateNode({ ...node, presentation })
      }
    }
  }

  onBeforeUnmount(() => {
    graphInstance.value?.destroy()
    graphInstance.value = null
  })

  return {
    setCanvasRef,
    graphInstance,
    zoom,
    zoomPercent,
    history,
    historyIndex,
    canUndo,
    canRedo,
    insertDialogVisible,
    insertTarget,
    insertHint,
    graphEvents,
    mountCanvas,
    resetHistory,
    pushHistory,
    undo,
    redo,
    addNode,
    removeSelectedNode,
    removeEdge,
    updateNodeData,
    handleVarNameChange,
    handleMaxIterationsChange,
    handleKeywordChange,
    handleSelectedEdgeKeywordChange,
    edgeDisplayName,
    confirmInsert,
    onPaletteDragStart,
    onCanvasDrop,
    handleAutoLayout,
    handleZoomIn,
    handleZoomOut,
    handleFitView,
    resetZoom,
    withPresentation,
    applyNodeRunStatus,
    refreshAllPresentations,
  }
}

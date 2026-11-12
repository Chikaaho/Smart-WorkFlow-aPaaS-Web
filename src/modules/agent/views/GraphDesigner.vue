<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { i18n, useI18n } from '@/locales'

const { t } = useI18n()
/* global HTMLElement, DragEvent, setTimeout, clearTimeout */
/**
 * GraphDesigner — 图设计器画布页（参数化静态路由 agent/graph-designer/:id）。
 *
 * 1.1.0 G1 重做：
 * - 自定义节点卡片（图标/标题/配置摘要/状态色）由 flow-graph 适配层渲染，
 *   本页通过 presentation 提供展示元数据；
 * - 节点面板分组、点击/拖入添加、节点与连线中点「+」插入、自动落位、整理布局；
 * - 撤销/重做（快照历史）、缩放栏、适配画布；
 * - 右侧配置面板按页签组织（配置/连接），开始/结束节点为参数声明面板；
 * - 点击连线编辑分支关键词、删除连线。
 *
 * 说明：结构变更全部走适配层命令式方法（不再销毁重挂载画布）。
 * 保存草稿：flowGraphDataToElements → saveDraftGraph（全量覆盖，不跑校验）。
 * 执行测试：仍走异步 lifecycle + 轮询（G1-7 将在此接入节点级状态）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
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
  cancelGraphExecution,
  executeGraph,
  getGraphExecutionLifecycle,
  listGraphExecutionEvents,
  submitGraphExecution,
  getGraphDef,
  listModelOptions,
  listToolOptions,
  pageKnowledgeBases,
  publishGraphDef,
  saveDraftGraph,
} from '@/modules/agent/api'
import {
  NODE_CONFIG_KEY_MAX_ITERATIONS,
  NODE_TYPE_CONDITION,
  NODE_TYPE_END,
  NODE_TYPE_FORK,
  NODE_TYPE_JOIN,
  NODE_TYPE_KNOWLEDGE,
  NODE_TYPE_LLM,
  NODE_TYPE_LOOP,
  NODE_TYPE_START,
  NODE_TYPE_TOOL,
  elementsToFlowGraphData,
  flowGraphDataToElements,
  nodeTypeLabel,
} from '@/modules/agent/utils/graphAdapter'
import {
  findFreePosition,
  layoutGraph,
  positionAfterNode,
  positionBetweenNodes,
} from '@/modules/agent/utils/graphLayout'
import { nodePresentation } from '@/modules/agent/utils/node-presentation'
import { getNodePanelDescriptor } from './panels/node-panel-registry'
import type {
  AgentGraphExecuteResp,
  AgentModelConfigOption,
  AgentToolOption,
  KnowledgeBase,
  ProcessGraph,
} from '@/contracts/agent'
import { ApiError } from '@/foundation/request'
import { parseRouteId } from '@/modules/agent/utils/routeId'

const route = useRoute()
const router = useRouter()

const graphId = computed(() => parseRouteId(route.params.id))

// ─── 图状态 ───
const graphName = ref('')
const graphKey = ref('')
const version = ref<number | null>(null)
const graphData = ref<FlowGraphData>({ nodes: [], edges: [] })
const loading = ref(false)
const loadError = ref('')

// ─── 画布 ───
const canvasRef = ref<HTMLElement | null>(null)
const graphInstance = ref<FlowGraphInstance | null>(null)
const zoom = ref(1)

// ─── 选择与属性面板 ───
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)
const activeNodeTab = ref<'config' | 'connection'>('config')
const modelOptions = ref<AgentModelConfigOption[]>([])
const toolOptions = ref<AgentToolOption[]>([])
const knowledgeOptions = ref<KnowledgeBase[]>([])

// ─── 历史（撤销/重做） ───
const history = ref<FlowGraphData[]>([])
const historyIndex = ref(-1)

// ─── 插入对话框 ───
const insertDialogVisible = ref(false)
const insertTarget = ref<FlowInsertTarget | null>(null)

// ─── 执行测试面板 ───
const executeInput = ref('')
const executeResult = ref<AgentGraphExecuteResp | null>(null)
const executing = ref(false)
const lifecycleStatus = ref('')
const streamedOutput = ref('')
const lastSequence = ref(0)
let pollTimer: ReturnType<typeof setTimeout> | null = null

const saving = ref(false)
const publishing = ref(false)

const selectedNode = computed<FlowGraphNode | null>(
  () => graphData.value.nodes.find((n) => n.id === selectedNodeId.value) ?? null,
)

const selectedEdge = computed<FlowGraphEdge | null>(
  () => graphData.value.edges.find((e) => e.id === selectedEdgeId.value) ?? null,
)

const selectedNodeType = computed(() => selectedNode.value?.type ?? '')

const presentationCtx = computed(() => ({
  modelOptions: modelOptions.value,
  toolOptions: toolOptions.value,
  knowledgeOptions: knowledgeOptions.value,
  edges: graphData.value.edges,
}))

/** 给节点补展示元数据（保留运行态 status） */
function withPresentation(nodes: FlowGraphNode[]): FlowGraphNode[] {
  return nodes.map((node) => ({
    ...node,
    presentation: nodePresentation(node, presentationCtx.value, node.presentation?.status),
  }))
}

const incomingEdges = computed(() =>
  graphData.value.edges.filter((e) => e.target === selectedNodeId.value),
)
const outgoingEdges = computed(() =>
  graphData.value.edges.filter((e) => e.source === selectedNodeId.value),
)

/** CONDITION 节点出边（条件分支关键词编辑入口） */
const conditionOutEdges = computed<FlowGraphEdge[]>(() => {
  if (selectedNodeType.value !== NODE_TYPE_CONDITION || !selectedNode.value) return []
  return outgoingEdges.value
})

const panelDescriptor = computed(() => getNodePanelDescriptor(selectedNodeType.value))
const panelComponent = computed(() => panelDescriptor.value?.component ?? null)
const panelLabel = computed(() =>
  panelDescriptor.value ? i18n.global.t(panelDescriptor.value.labelKey) : selectedNodeType.value,
)

const NODE_TYPES = [
  NODE_TYPE_START,
  NODE_TYPE_END,
  NODE_TYPE_LLM,
  NODE_TYPE_TOOL,
  NODE_TYPE_CONDITION,
  NODE_TYPE_LOOP,
  NODE_TYPE_FORK,
  NODE_TYPE_JOIN,
  NODE_TYPE_KNOWLEDGE,
]

const PALETTE_GROUPS: Array<{ labelKey: string; types: string[] }> = [
  { labelKey: 'agent.paletteGroupBasic', types: [NODE_TYPE_START, NODE_TYPE_END] },
  {
    labelKey: 'agent.paletteGroupCapability',
    types: [NODE_TYPE_LLM, NODE_TYPE_TOOL, NODE_TYPE_KNOWLEDGE],
  },
  {
    labelKey: 'agent.paletteGroupControl',
    types: [NODE_TYPE_CONDITION, NODE_TYPE_LOOP, NODE_TYPE_FORK, NODE_TYPE_JOIN],
  },
]

/** 「+」插入可选类型（开始/结束节点不可插入，避免破坏唯一性） */
const INSERTABLE_TYPES = NODE_TYPES.filter(
  (type) => type !== NODE_TYPE_START && type !== NODE_TYPE_END,
)

const insertHint = computed(() => {
  const target = insertTarget.value
  if (!target) return ''
  if (target.kind === 'edge') return t('agent.insertIntoEdgeHint')
  const label = graphData.value.nodes.find((n) => n.id === target.id)?.label ?? target.id
  return t('agent.insertAfterNodeHint', { label })
})

const zoomPercent = computed(() => Math.round(zoom.value * 100))
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

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
  graphData.value = { nodes: withPresentation(graphData.value.nodes), edges: graphData.value.edges }
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
  if (!selectedEdge.value) return
  handleKeywordChange(selectedEdge.value, value)
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

function handleAutoLayout() {
  const laidOut = layoutGraph(graphData.value.nodes, graphData.value.edges)
  graphInstance.value?.setData({
    nodes: withPresentation(laidOut),
    edges: graphData.value.edges.map((e) => ({ ...e })),
  })
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

// ─── 加载 ───

async function loadGraph() {
  loading.value = true
  loadError.value = ''
  try {
    const graph = await getGraphDef(graphId.value)
    graphName.value = graph.name
    graphKey.value = graph.graphKey
    version.value = graph.version ?? 1
    const data = elementsToFlowGraphData(graph.elements)
    graphData.value = {
      nodes: withPresentation(
        data.nodes.map((n) => ({ ...n, label: nodeTypeLabel(n.type ?? '') })),
      ),
      edges: data.edges,
    }
    await nextTick()
    mountCanvas()
    history.value = [cloneData(graphData.value)]
    historyIndex.value = 0
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('agent.graphDefLoadFailed')
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  try {
    const [models, tools, knowledgePage] = await Promise.all([
      listModelOptions(),
      listToolOptions(),
      pageKnowledgeBases({ pageNum: 1, pageSize: 100 }),
    ])
    modelOptions.value = models
    toolOptions.value = tools
    knowledgeOptions.value = knowledgePage.list
    refreshAllPresentations()
  } catch (err) {
    ElMessage.warning(
      t('agent.dropdownLoadFailed') + ((err as ApiError).msg ?? t('common.unknownError')),
    )
  }
}

/** 选项加载完成后刷新全部节点摘要（模型名/工具名/知识库名） */
function refreshAllPresentations() {
  const instance = graphInstance.value
  if (!instance) return
  const current = instance.exportGraph()
  for (const node of current.nodes) {
    const source = graphData.value.nodes.find((n) => n.id === node.id) ?? node
    const presentation = nodePresentation(source, presentationCtx.value, node.presentation?.status)
    if (JSON.stringify(presentation) !== JSON.stringify(node.presentation)) {
      instance.updateNode({ ...node, presentation })
    }
  }
}

// ─── 保存草稿 / 发布 / 执行 ───

async function handleSaveDraft() {
  saving.value = true
  try {
    const graph: ProcessGraph = {
      graphKey: graphKey.value,
      name: graphName.value,
      version: version.value ?? 1,
      elements: flowGraphDataToElements(graphData.value),
      canvas: {},
    }
    await saveDraftGraph(graphId.value, graph)
    ElMessage.success(t('common.draftSaved'))
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.saveDraftFailed'))
  } finally {
    saving.value = false
  }
}

async function handlePublish() {
  publishing.value = true
  try {
    const published = await publishGraphDef(graphId.value)
    graphKey.value = published.graphKey
    version.value = published.defVersion
    ElMessage.success(t('agent.graphPublishedWithHint', { defVersion: published.defVersion }))
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.publishFailed'))
  } finally {
    publishing.value = false
  }
}

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'CANCELLED', 'INTERRUPTED'])

const executeAlertType = computed<'success' | 'info' | 'error'>(() => {
  if (executeResult.value?.success) return 'success'
  if (lifecycleStatus.value === 'CANCELLED') return 'info'
  return 'error'
})

const executeAlertTitle = computed(() => {
  if (executeResult.value?.success) return t('agent.executionSucceeded')
  if (lifecycleStatus.value === 'CANCELLED') return t('agent.executionCancelled')
  return t('agent.executionFailed')
})

async function refreshExecution(executionId: number) {
  const [state, events] = await Promise.all([
    getGraphExecutionLifecycle(executionId),
    listGraphExecutionEvents(executionId, lastSequence.value),
  ])
  lifecycleStatus.value = state.status
  for (const event of events) {
    if (event.sequence <= lastSequence.value) continue
    lastSequence.value = event.sequence
    if (event.type === 'MODEL_DELTA') streamedOutput.value += event.payload ?? ''
  }
  executeResult.value = {
    executionId,
    success: state.status === 'SUCCESS',
    output: state.output ?? streamedOutput.value,
    errorMessage: state.errorMessage,
    latencyMs: state.latencyMs ?? 0,
  }
  if (TERMINAL_STATUSES.has(state.status)) {
    executing.value = false
    return
  }
  pollTimer = setTimeout(() => void refreshExecution(executionId), 800)
}

async function handleExecute() {
  const input = executeInput.value.trim()
  if (!input) {
    ElMessage.warning(t('agent.testTextRequired'))
    return
  }
  if (pollTimer) clearTimeout(pollTimer)
  executing.value = true
  executeResult.value = null
  streamedOutput.value = ''
  lastSequence.value = 0
  try {
    // 测试桩和旧部署未提供生命周期端点时保留同步兼容入口；正式环境始终走异步受理。
    if (import.meta.env.MODE === 'test') {
      executeResult.value = await executeGraph(graphId.value, input)
      executing.value = false
      return
    }
    const accepted = await submitGraphExecution(
      graphId.value,
      input,
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    )
    lifecycleStatus.value = accepted.status
    executeResult.value = { executionId: accepted.executionId, success: false, latencyMs: 0 }
    await refreshExecution(accepted.executionId)
  } catch (err) {
    executing.value = false
    executeResult.value = {
      success: false,
      errorMessage: err instanceof ApiError ? err.msg : t('agent.executionFailed'),
      latencyMs: 0,
    }
  }
}

async function handleCancelExecution() {
  const executionId = executeResult.value?.executionId
  if (!executionId) return
  const state = await cancelGraphExecution(executionId)
  lifecycleStatus.value = state.status
}

/** 从图设计器直达本次执行详情 */
function handleViewExecutionDetail() {
  const eid = executeResult.value?.executionId
  if (eid) {
    void router.push(`/agent/executions/detail/${eid}`)
  } else {
    ElMessage.warning(t('agent.noExecutionToJumpTo'))
  }
}

watch(selectedNodeId, () => {
  activeNodeTab.value = 'config'
})

onMounted(() => {
  void loadGraph()
  void loadOptions()
})

onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer)
  graphInstance.value?.destroy()
  graphInstance.value = null
})
</script>

<template>
  <div class="graph-designer">
    <!-- 头部 -->
    <div class="designer-header">
      <div class="header-title">
        <span class="title-text">{{ graphName || t('agent.untitledGraph') }}</span>
        <el-tag v-if="version" size="small" type="info">v{{ version }}</el-tag>
      </div>
      <div class="header-actions">
        <el-button-group>
          <el-button size="small" :disabled="!canUndo" @click="undo">{{
            t('agent.undo')
          }}</el-button>
          <el-button size="small" :disabled="!canRedo" @click="redo">{{
            t('agent.redo')
          }}</el-button>
        </el-button-group>
        <el-button size="small" @click="handleAutoLayout">{{ t('agent.autoLayout') }}</el-button>
        <el-button size="small" @click="router.push('/agent/graph-def')">{{
          t('common.backToList')
        }}</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="handleSaveDraft">{{
          t('common.saveDraft')
        }}</el-button>
        <el-button size="small" type="success" :loading="publishing" @click="handlePublish">{{
          t('common.publish')
        }}</el-button>
      </div>
    </div>

    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      :closable="false"
      show-icon
      style="margin: 16px"
    />

    <div v-else v-loading="loading" class="designer-body">
      <!-- 节点面板（分组 + 拖入/点击添加） -->
      <div class="palette">
        <div v-for="group in PALETTE_GROUPS" :key="group.labelKey" class="palette-group">
          <div class="palette-title">{{ t(group.labelKey) }}</div>
          <el-button
            v-for="type in group.types"
            :key="type"
            size="small"
            class="palette-item"
            draggable="true"
            @dragstart="onPaletteDragStart(type, $event)"
            @click="addNode(type)"
          >
            {{ nodeTypeLabel(type) }}
          </el-button>
        </div>
        <div class="palette-hint">{{ t('agent.paletteDragHint') }}</div>
      </div>

      <!-- 画布 -->
      <div class="canvas-wrap" @dragover.prevent @drop="onCanvasDrop">
        <div ref="canvasRef" class="canvas" />
        <div class="zoom-bar">
          <button type="button" :aria-label="t('agent.zoomOut')" @click="handleZoomOut">−</button>
          <span class="zoom-value">{{ zoomPercent }}%</span>
          <button type="button" :aria-label="t('agent.zoomIn')" @click="handleZoomIn">+</button>
          <button type="button" class="zoom-fit" @click="handleFitView">
            {{ t('agent.zoomFit') }}
          </button>
        </div>
      </div>

      <!-- 属性面板 -->
      <div class="property-panel">
        <!-- 连线属性 -->
        <template v-if="selectedEdge">
          <div class="panel-title">{{ t('agent.edgeProperties') }}</div>
          <div class="panel-field">
            <div class="panel-field__label">{{ t('agent.edgeKeywordLabel') }}</div>
            <el-input
              :model-value="selectedEdge.label ?? ''"
              size="small"
              :placeholder="t('agent.edgeKeywordPlaceholder')"
              @change="handleSelectedEdgeKeywordChange"
            />
          </div>
          <div class="panel-meta">
            <div>
              {{ t('agent.edgeSourceLabel') }}：{{ edgeDisplayName(selectedEdge).split(' → ')[0] }}
            </div>
            <div>
              {{ t('agent.edgeTargetLabel') }}：{{ edgeDisplayName(selectedEdge).split(' → ')[1] }}
            </div>
            <div>{{ t('agent.edgeIdLabel') }}：{{ selectedEdge.id }}</div>
          </div>
          <div class="panel-footer">
            <el-button size="small" type="danger" plain @click="removeEdge(selectedEdge.id)">
              {{ t('agent.deleteEdge') }}
            </el-button>
          </div>
        </template>

        <!-- 节点属性 -->
        <template v-else-if="selectedNode">
          <div class="panel-title">
            {{ t('agent.nodeProperties') }}
            <span class="panel-sub">{{ enumLabel('AGENT_NODE_TYPE', selectedNode.type) }}</span>
          </div>

          <el-tabs v-model="activeNodeTab" class="node-tabs">
            <el-tab-pane :label="t('agent.nodeTabConfig')" name="config">
              <component
                :is="panelComponent"
                v-if="panelComponent"
                :node="selectedNode"
                :label="panelLabel"
                :model-options="modelOptions"
                :tool-options="toolOptions"
                :knowledge-options="knowledgeOptions"
                :condition-out-edges="conditionOutEdges"
                :edge-display-name="edgeDisplayName"
                @update-node-data="updateNodeData"
                @var-name-change="handleVarNameChange"
                @max-iterations-change="handleMaxIterationsChange"
                @keyword-change="handleKeywordChange"
                @remove-edge="removeEdge"
              />
            </el-tab-pane>
            <el-tab-pane :label="t('agent.nodeTabConnection')" name="connection">
              <div class="panel-field__label">{{ t('agent.incomingEdges') }}</div>
              <div v-if="incomingEdges.length === 0" class="panel-empty">
                {{ t('agent.noConnection') }}
              </div>
              <el-button
                v-for="edge in incomingEdges"
                :key="edge.id"
                size="small"
                link
                type="primary"
                class="connection-link"
                @click="selectedEdgeId = edge.id"
              >
                {{ edgeDisplayName(edge) }}
              </el-button>
              <div class="panel-field__label connect-out-label">{{ t('agent.outgoingEdges') }}</div>
              <div v-if="outgoingEdges.length === 0" class="panel-empty">
                {{ t('agent.noConnection') }}
              </div>
              <el-button
                v-for="edge in outgoingEdges"
                :key="edge.id"
                size="small"
                link
                type="primary"
                class="connection-link"
                @click="selectedEdgeId = edge.id"
              >
                {{ edgeDisplayName(edge) }}
              </el-button>
              <div class="panel-meta">
                <div>{{ t('agent.nodeIdLabel') }}：{{ selectedNode.id }}</div>
              </div>
            </el-tab-pane>
          </el-tabs>

          <div v-if="selectedNodeType !== NODE_TYPE_START" class="panel-footer">
            <el-button size="small" type="danger" plain @click="removeSelectedNode">
              {{ t('agent.deleteNode') }}
            </el-button>
          </div>
        </template>

        <el-empty v-else :description="t('agent.clickNodeToEditHint')" :image-size="60">
          <template #description>
            <div>{{ t('agent.clickNodeToEditHint') }}</div>
            <div class="panel-empty">{{ t('agent.selectEdgeHint') }}</div>
          </template>
        </el-empty>
      </div>
    </div>

    <!-- 插入节点类型选择 -->
    <el-dialog v-model="insertDialogVisible" :title="t('agent.insertNodeTitle')" width="420px">
      <div class="insert-hint">{{ insertHint }}</div>
      <div class="insert-grid">
        <el-button
          v-for="type in INSERTABLE_TYPES"
          :key="type"
          size="small"
          @click="confirmInsert(type)"
        >
          {{ nodeTypeLabel(type) }}
        </el-button>
      </div>
    </el-dialog>

    <!-- 执行测试面板（结果不落库，刷新即失） -->
    <div class="execute-panel">
      <div class="execute-row">
        <span class="execute-label">{{ t('agent.runTest') }}</span>
        <el-input
          v-model="executeInput"
          :placeholder="t('agent.testTextPlaceholder')"
          style="width: 360px"
          size="small"
        />
        <el-button type="primary" size="small" :loading="executing" @click="handleExecute">
          {{ t('agent.run') }}
        </el-button>
        <el-button
          v-if="executing && executeResult?.executionId"
          type="danger"
          plain
          size="small"
          @click="handleCancelExecution"
        >
          取消执行
        </el-button>
        <el-tag v-if="lifecycleStatus" type="info" size="small">{{ lifecycleStatus }}</el-tag>
      </div>
      <el-alert
        v-if="executeResult"
        :title="executeAlertTitle"
        :type="executeAlertType"
        :closable="false"
        show-icon
        class="execute-result"
      >
        <template v-if="executeResult.output || streamedOutput">
          <div class="stream-output">
            {{ t('agent.outputLabel', { output: executeResult.output || streamedOutput }) }}
          </div>
        </template>
        <template v-else-if="!executeResult.success && executeResult.errorMessage">
          <div>{{ t('agent.reasonLabel', { errorMessage: executeResult.errorMessage }) }}</div>
        </template>
        <div class="execute-meta">
          {{ t('agent.latencyLabel', { latencyMs: executeResult.latencyMs }) }}
        </div>
        <div v-if="executeResult.executionId" class="execute-detail-link">
          <el-button size="small" link type="primary" @click="handleViewExecutionDetail">
            {{ t('agent.viewExecution') }}
          </el-button>
        </div>
      </el-alert>
    </div>
  </div>
</template>

<style scoped>
.graph-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  gap: 12px;
}

.designer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.designer-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 12px;
}

.palette {
  width: 132px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow-y: auto;
  flex: none;
}

.palette-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.palette-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 4px;
}

.palette-item {
  width: 100%;
  margin-left: 0 !important;
}

.palette-item + .palette-item {
  margin-left: 0 !important;
}

.palette-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  line-height: 16px;
  margin-top: auto;
}

.canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
}

.canvas {
  width: 100%;
  height: 100%;
}

.zoom-bar {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: #fff;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  box-shadow: var(--el-box-shadow-light, 0 1px 8px rgba(0, 0, 0, 0.04));
  z-index: 3;
}

.zoom-bar button {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  font-size: 14px;
  line-height: 24px;
}

.zoom-bar button:hover {
  background: var(--el-fill-color-light);
}

.zoom-bar .zoom-fit {
  width: auto;
  padding: 0 8px;
  font-size: 12px;
}

.zoom-value {
  min-width: 40px;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.property-panel {
  width: 320px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 12px;
  overflow-y: auto;
  flex: none;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.panel-sub {
  margin-left: 8px;
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.panel-field {
  margin-bottom: 10px;
}

.panel-field__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.connect-out-label {
  margin-top: 12px;
}

.panel-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 20px;
  margin-top: 8px;
  word-break: break-all;
}

.panel-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 2px 0 6px;
}

.connection-link {
  display: block;
  margin: 2px 0;
}

.panel-footer {
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color-light);
  padding-top: 12px;
}

.node-tabs :deep(.el-tabs__header) {
  margin-bottom: 10px;
}

.insert-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}

.insert-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.insert-grid .el-button {
  width: 100%;
  margin-left: 0 !important;
}

.execute-panel {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 12px;
}

.execute-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.execute-label {
  font-size: 13px;
  font-weight: 600;
}

.execute-result {
  margin-top: 8px;
}

.execute-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.execute-detail-link {
  margin-top: 4px;
}
</style>

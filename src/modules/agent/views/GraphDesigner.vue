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
import { ElMessage, ElMessageBox } from 'element-plus'
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
  listExecutionHumanTasks,
  listUserChoices,
  listGraphDefVersions,
  pageGraphDefs,
  runGraphNode,
  submitGraphExecution,
  getGraphDef,
  listModelOptions,
  listToolOptions,
  pageKnowledgeBases,
  publishGraphDef,
  saveDraftGraph,
} from '@/modules/agent/api'
import type { AgentExecutionLifecycle, AgentNodeRunResult } from '@/modules/agent/api'
import type {
  AgentHumanTask,
  AgentGraphExecuteResp,
  AgentModelConfigOption,
  AgentToolOption,
  KnowledgeBase,
  ProcessGraph,
} from '@/contracts/agent'
import HumanTaskSubmitDialog from '@/modules/agent/components/execution/HumanTaskSubmitDialog.vue'
import {
  NODE_CONFIG_KEY_INPUT_PARAMS,
  NODE_CONFIG_KEY_MAX_ITERATIONS,
  NODE_CONFIG_KEY_SUBGRAPH_DEF_ID,
  NODE_CONFIG_KEY_SYSTEM_PROMPT,
  NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE,
  NODE_TYPE_CONDITION,
  NODE_TYPE_END,
  NODE_TYPE_FORK,
  NODE_TYPE_HUMAN,
  NODE_TYPE_JOIN,
  NODE_TYPE_KNOWLEDGE,
  NODE_TYPE_LLM,
  NODE_TYPE_LOOP,
  NODE_TYPE_START,
  NODE_TYPE_SUBGRAPH,
  NODE_TYPE_TOOL,
  elementsToFlowGraphData,
  flowGraphDataToElements,
  nodeTypeLabel,
  type StartParam,
} from '@/modules/agent/utils/graphAdapter'
import {
  findFreePosition,
  layoutGraph,
  positionAfterNode,
  positionBetweenNodes,
} from '@/modules/agent/utils/graphLayout'
import { nodePresentation } from '@/modules/agent/utils/node-presentation'
import {
  buildVariableGroups,
  extractVariableRefs,
  validateGraphVariables,
} from '@/modules/agent/utils/variableReferences'
import { getNodePanelDescriptor } from './panels/node-panel-registry'
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
/** G3：已发布图（SUBGRAPH 选择）与处理人候选（HUMAN 选择） */
const graphOptions = ref<Array<{ id: number | string; name: string; defVersion?: number }>>([])
const userOptions = ref<Array<{ id: string; label: string }>>([])
/** G3：当前选中子图节点的发布版本快照 */
const subgraphVersions = ref<Array<{ defVersion: number }>>([])

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

// ─── G1-7 节点运行状态与详情 ───
interface NodeRunState {
  status: 'waiting' | 'running' | 'success' | 'failed' | 'skipped'
  latencyMs?: number
  input?: string
  output?: string
  errorMessage?: string
  /** G3：SUBGRAPH 节点的子执行 id */
  childExecutionId?: number
}
const nodeRunStates = ref<Record<string, NodeRunState>>({})

// ─── G1-4 开始参数表单 ───
/** 开始节点声明的输入参数（无声明 = 旧单文本契约） */
const startParams = computed<StartParam[]>(() => {
  const start = graphData.value.nodes.find((n) => n.type === NODE_TYPE_START)
  const raw = start?.data?.[NODE_CONFIG_KEY_INPUT_PARAMS]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      name: String(p.name ?? '').trim(),
      type: (['text', 'number', 'boolean', 'json'] as const).includes(p.type as StartParam['type'])
        ? (p.type as StartParam['type'])
        : 'text',
      required: p.required === true,
      description: typeof p.description === 'string' ? p.description : '',
    }))
    .filter((p) => p.name !== '')
})
const structuredInputs = ref<Record<string, string | boolean>>({})

/** 参数表单取值/写回（boolean 开关与文本输入共用） */
function paramValue(name: string): string | boolean {
  return structuredInputs.value[name] ?? ''
}

function setParamValue(name: string, value: string | boolean) {
  structuredInputs.value = { ...structuredInputs.value, [name]: value }
}

// ─── G3 等待人工 ───
const waitingHumanTask = ref<AgentHumanTask | null>(null)
const humanTaskDialogVisible = ref(false)

/** 等待处理人展示名：角色 code > 用户姓名 > 用户 id */
const waitingAssigneeLabel = computed(() => {
  const task = waitingHumanTask.value
  if (!task) return ''
  if (task.assigneeRoleCode) return task.assigneeRoleCode
  if (task.assigneeUserId !== null && task.assigneeUserId !== undefined) {
    const user = userOptions.value.find((u) => u.id === String(task.assigneeUserId))
    return user?.label ?? `#${task.assigneeUserId}`
  }
  return t('agent.humanTaskPending')
})

// ─── G1-8 单节点运行 ───
const singleNodeDialogVisible = ref(false)
const singleNodeInputs = ref<Record<string, string>>({})
const singleNodeResult = ref<AgentNodeRunResult | null>(null)
const singleNodeRunning = ref(false)

const RUNNABLE_NODE_TYPES = [NODE_TYPE_LLM, NODE_TYPE_TOOL, NODE_TYPE_KNOWLEDGE]

/** 单节点运行所需变量名：节点 inputVar + Prompt 模板中引用的变量（去重） */
const singleNodeVariableNames = computed<string[]>(() => {
  const node = selectedNode.value
  if (!node) return []
  const names = new Set<string>()
  const inputVar = node.data?.inputVar
  names.add(typeof inputVar === 'string' && inputVar.trim() ? inputVar.trim() : 'input')
  for (const key of [NODE_CONFIG_KEY_SYSTEM_PROMPT, NODE_CONFIG_KEY_USER_PROMPT_TEMPLATE]) {
    const text = node.data?.[key]
    if (typeof text !== 'string') continue
    for (const ref of extractVariableRefs(text)) {
      if (!ref.includes('.')) names.add(ref)
    }
  }
  return Array.from(names)
})

/** 当前选中节点的运行详情（G1-7：点节点看耗时/入参/出参/错误） */
const selectedNodeRun = computed<NodeRunState | null>(() =>
  selectedNodeId.value ? (nodeRunStates.value[selectedNodeId.value] ?? null) : null,
)

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
  graphOptions: graphOptions.value,
  edges: graphData.value.edges,
}))

/** 给节点补展示元数据（保留运行态 status） */
function withPresentation(nodes: FlowGraphNode[]): FlowGraphNode[] {
  return nodes.map((node) => ({
    ...node,
    presentation: nodePresentation(node, presentationCtx.value, node.presentation?.status),
  }))
}

// ─── G1-7 节点运行状态 ───

const NODE_STATUS_LABEL_KEYS: Record<NodeRunState['status'], string> = {
  waiting: 'agent.nodeStatusWaiting',
  running: 'agent.nodeStatusRunning',
  success: 'agent.nodeStatusSuccess',
  failed: 'agent.nodeStatusFailed',
  skipped: 'agent.nodeStatusSkipped',
}

function nodeStatusLabel(status: NodeRunState['status']): string {
  return t(NODE_STATUS_LABEL_KEYS[status])
}

/** 把运行状态写到节点卡片（presentation.status → 适配层状态色） */
function applyNodeRunStatus(nodeId: string, status: NodeRunState['status']) {
  const node = graphData.value.nodes.find((n) => n.id === nodeId)
  if (!node) return
  const presentation = nodePresentation(node, presentationCtx.value, status)
  graphInstance.value?.updateNode({ ...node, presentation })
}

/** 运行开始：全部节点置「等待」并清空上一轮详情 */
function resetRunStates() {
  nodeRunStates.value = {}
  for (const node of graphData.value.nodes) {
    applyNodeRunStatus(node.id, 'waiting')
  }
}

/** 解析逐节点事件（NODE_STARTED / NODE_FINISHED） */
function handleRunEvent(type: string, nodeId: string | undefined, payload: string | undefined) {
  if (!nodeId) return
  if (type === 'NODE_STARTED') {
    nodeRunStates.value = { ...nodeRunStates.value, [nodeId]: { status: 'running' } }
    applyNodeRunStatus(nodeId, 'running')
    return
  }
  if (type !== 'NODE_FINISHED') return
  let detail: Record<string, unknown> = {}
  if (payload) {
    try {
      detail = JSON.parse(payload) as Record<string, unknown>
    } catch {
      detail = {}
    }
  }
  const status: NodeRunState['status'] = detail.status === 'FAILED' ? 'failed' : 'success'
  nodeRunStates.value = {
    ...nodeRunStates.value,
    [nodeId]: {
      status,
      latencyMs: typeof detail.latencyMs === 'number' ? detail.latencyMs : undefined,
      input: typeof detail.input === 'string' ? detail.input : undefined,
      output: typeof detail.output === 'string' ? detail.output : undefined,
      errorMessage: typeof detail.errorMessage === 'string' ? detail.errorMessage : undefined,
      childExecutionId:
        typeof detail.childExecutionId === 'number' ? detail.childExecutionId : undefined,
    },
  }
  applyNodeRunStatus(nodeId, status)
}

/** 执行终态：从未开始的节点标记为「跳过」（未走到的分支） */
function markRemainingSkipped() {
  const next = { ...nodeRunStates.value }
  for (const node of graphData.value.nodes) {
    if (!next[node.id] || next[node.id].status === 'running') {
      next[node.id] = { ...(next[node.id] ?? {}), status: 'skipped' }
      applyNodeRunStatus(node.id, 'skipped')
    }
  }
  nodeRunStates.value = next
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

/** 当前节点可用变量（G1-5：只列上游可达节点输出 + 开始参数） */
const variableGroups = computed(() =>
  selectedNode.value
    ? buildVariableGroups(selectedNode.value, graphData.value.nodes, graphData.value.edges)
    : [],
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
  NODE_TYPE_HUMAN,
  NODE_TYPE_SUBGRAPH,
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
  {
    labelKey: 'agent.paletteGroupInteraction',
    types: [NODE_TYPE_HUMAN, NODE_TYPE_SUBGRAPH],
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

/** G3：加载选中子图节点的发布版本快照 */
async function loadSubgraphVersions(defId: string) {
  if (!defId) {
    subgraphVersions.value = []
    return
  }
  try {
    const snapshots = await listGraphDefVersions(defId)
    subgraphVersions.value = snapshots
      .map((s) => ({ defVersion: s.defVersion }))
      .sort((a, b) => b.defVersion - a.defVersion)
  } catch {
    subgraphVersions.value = []
  }
}

watch(
  () => [selectedNodeType.value, selectedNode.value?.data?.[NODE_CONFIG_KEY_SUBGRAPH_DEF_ID]],
  ([type, defId]) => {
    if (type !== NODE_TYPE_SUBGRAPH) {
      subgraphVersions.value = []
      return
    }
    void loadSubgraphVersions(defId === undefined || defId === null ? '' : String(defId))
  },
)

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
    // G3 附属选项：处理人/已发布图加载失败不阻断设计器主流程
    const usersPromise =
      typeof listUserChoices === 'function'
        ? listUserChoices().catch(() => [])
        : Promise.resolve([])
    const graphsPromise =
      typeof pageGraphDefs === 'function'
        ? pageGraphDefs({ pageNum: 1, pageSize: 100 }).catch(() => ({ list: [] }))
        : Promise.resolve({ list: [] })
    const [users, graphPage] = await Promise.all([usersPromise, graphsPromise])
    userOptions.value = users ?? []
    graphOptions.value = (graphPage.list ?? [])
      .filter((g) => g.status === 'PUBLISHED' && String(g.id) !== String(graphId.value))
      .map((g) => ({ id: g.id, name: g.name, defVersion: g.defVersion }))
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
  // G1-5：发布前校验参数声明与变量引用（精确到节点/字段/引用）
  const errors = validateGraphVariables(graphData.value.nodes, graphData.value.edges)
  if (errors.length > 0) {
    const detail = errors
      .slice(0, 3)
      .map(
        (e) => `${e.nodeLabel} · ${e.field}${e.reference ? ` · ${e.reference}` : ''}：${e.reason}`,
      )
      .join('；')
    ElMessage.error(`${t('agent.publishValidationFailed', { count: errors.length })}${detail}`)
    return
  }
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
  if (lifecycleStatus.value === 'CANCELLED' || lifecycleStatus.value === 'WAITING_HUMAN') {
    return 'info'
  }
  return 'error'
})

const executeAlertTitle = computed(() => {
  if (executeResult.value?.success) return t('agent.executionSucceeded')
  if (lifecycleStatus.value === 'CANCELLED') return t('agent.executionCancelled')
  if (lifecycleStatus.value === 'WAITING_HUMAN') return t('agent.humanWaitingAlert')
  return t('agent.executionFailed')
})

const LIFECYCLE_STATUS_KEYS: Record<string, string> = {
  RUNNING: 'common.statusRunning',
  QUEUED: 'agent.nodeStatusWaiting',
  WAITING_HUMAN: 'agent.humanTaskWaitStatus',
  SUCCESS: 'common.resultSuccess',
  FAILED: 'common.resultFailed',
  CANCELLED: 'agent.executionCancelled',
}

const lifecycleStatusLabel = computed(() =>
  lifecycleStatus.value
    ? t(LIFECYCLE_STATUS_KEYS[lifecycleStatus.value] ?? lifecycleStatus.value)
    : '',
)

async function refreshExecution(executionId: number) {
  const [state, events] = await Promise.all([
    getGraphExecutionLifecycle(executionId),
    listGraphExecutionEvents(executionId, lastSequence.value),
  ])
  lifecycleStatus.value = state.status
  if (state.status === 'WAITING_HUMAN') {
    await syncWaitingHuman(executionId)
  } else {
    waitingHumanTask.value = null
  }
  for (const event of events) {
    if (event.sequence <= lastSequence.value) continue
    lastSequence.value = event.sequence
    if (event.type === 'MODEL_DELTA') {
      streamedOutput.value += event.payload ?? ''
    } else if (event.type === 'NODE_STARTED' || event.type === 'NODE_FINISHED') {
      handleRunEvent(event.type, event.nodeId, event.payload)
    }
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
    markRemainingSkipped()
    return
  }
  pollTimer = setTimeout(() => void refreshExecution(executionId), 800)
}

/** G3：等待人工——把待处理节点置「等待」并准备提交入口 */
async function syncWaitingHuman(executionId: number) {
  try {
    const tasks = await listExecutionHumanTasks(executionId)
    const pending = tasks.filter((task) => task.status === 'PENDING')
    waitingHumanTask.value = pending[0] ?? null
    for (const task of pending) {
      nodeRunStates.value = {
        ...nodeRunStates.value,
        [task.nodeId]: { status: 'waiting' },
      }
      applyNodeRunStatus(task.nodeId, 'waiting')
    }
  } catch {
    waitingHumanTask.value = null
  }
}

/** G3：人工任务提交成功——清空等待并继续轮询直到终态 */
async function handleHumanTaskSubmitted(_state: AgentExecutionLifecycle) {
  ElMessage.success(t('agent.humanTaskSubmitted'))
  waitingHumanTask.value = null
  humanTaskDialogVisible.value = false
  const executionId = executeResult.value?.executionId
  if (executionId) {
    if (pollTimer) clearTimeout(pollTimer)
    await refreshExecution(executionId)
  }
}

async function handleExecute() {
  // G1-4：有参数声明的图走结构化入参；无声明保持旧单文本契约
  const params = startParams.value
  let submitInput = ''
  let inputs: Record<string, string> | undefined
  if (params.length > 0) {
    const values: Record<string, string> = {}
    for (const param of params) {
      const raw = structuredInputs.value[param.name]
      const value = typeof raw === 'boolean' ? String(raw) : String(raw ?? '').trim()
      if (param.required && value === '') {
        ElMessage.warning(t('agent.structuredInputRequired', { name: param.name }))
        return
      }
      if (value !== '') values[param.name] = value
    }
    inputs = values
  } else {
    const input = executeInput.value.trim()
    if (!input) {
      ElMessage.warning(t('agent.testTextRequired'))
      return
    }
    submitInput = input
  }
  if (pollTimer) clearTimeout(pollTimer)
  executing.value = true
  executeResult.value = null
  streamedOutput.value = ''
  lastSequence.value = 0
  resetRunStates()
  try {
    // 测试桩和旧部署未提供生命周期端点时保留同步兼容入口；正式环境始终走异步受理。
    if (import.meta.env.MODE === 'test') {
      executeResult.value = await executeGraph(graphId.value, submitInput)
      executing.value = false
      return
    }
    const accepted = await submitGraphExecution(
      graphId.value,
      submitInput,
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      inputs,
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

// ─── G1-8 单节点运行 ───

function openSingleNodeDialog() {
  if (!selectedNode.value) return
  singleNodeResult.value = null
  const initial: Record<string, string> = {}
  for (const name of singleNodeVariableNames.value) {
    initial[name] = singleNodeInputs.value[name] ?? ''
  }
  singleNodeInputs.value = initial
  singleNodeDialogVisible.value = true
}

async function confirmSingleNodeRun() {
  const node = selectedNode.value
  if (!node) return
  const inputs: Record<string, string> = {}
  for (const name of singleNodeVariableNames.value) {
    const value = String(singleNodeInputs.value[name] ?? '')
    if (value.trim() !== '') inputs[name] = value
  }
  if (Object.keys(inputs).length === 0) {
    ElMessage.warning(t('agent.nodeRunRequiredInput'))
    return
  }
  if (node.type === NODE_TYPE_TOOL) {
    try {
      await ElMessageBox.confirm(
        t('agent.toolRunConfirmBody', { tool: String(node.data?.toolName ?? '') }),
        t('agent.toolRunConfirmTitle'),
        { type: 'warning' },
      )
    } catch {
      return
    }
  }
  singleNodeRunning.value = true
  try {
    singleNodeResult.value = await runGraphNode(graphId.value, node.id, inputs)
  } catch (err) {
    singleNodeResult.value = {
      success: false,
      status: 'FAILED',
      errorMessage: err instanceof ApiError ? err.msg : t('agent.executionFailed'),
      latencyMs: 0,
    }
  } finally {
    singleNodeRunning.value = false
  }
}

watch(selectedNodeId, () => {
  activeNodeTab.value = 'config'
})

/** G3：执行详情跳转子执行 */
function openChildExecution(childExecutionId: number) {
  void router.push(`/agent/executions/detail/${childExecutionId}`)
}

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
                :variable-groups="variableGroups"
                :user-options="userOptions"
                :graph-options="graphOptions"
                :subgraph-versions="subgraphVersions"
                @update-node-data="updateNodeData"
                @subgraph-graph-change="loadSubgraphVersions"
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
            <el-tab-pane v-if="selectedNodeRun" :label="t('agent.nodeTabRun')" name="run">
              <div class="panel-field__label">{{ t('agent.nodeRunStatus') }}</div>
              <el-tag size="small" :type="selectedNodeRun.status === 'failed' ? 'danger' : 'info'">
                {{ nodeStatusLabel(selectedNodeRun.status) }}
              </el-tag>
              <div v-if="selectedNodeRun.latencyMs !== undefined" class="panel-meta">
                {{ t('agent.nodeRunLatency') }}：{{ selectedNodeRun.latencyMs }}ms
              </div>
              <template v-if="selectedNodeRun.input">
                <div class="panel-field__label">{{ t('agent.nodeRunInput') }}</div>
                <pre class="node-run-text">{{ selectedNodeRun.input }}</pre>
              </template>
              <template v-if="selectedNodeRun.output">
                <div class="panel-field__label">{{ t('agent.nodeRunOutput') }}</div>
                <pre class="node-run-text">{{ selectedNodeRun.output }}</pre>
              </template>
              <template v-if="selectedNodeRun.errorMessage">
                <div class="panel-field__label">{{ t('agent.nodeRunError') }}</div>
                <pre class="node-run-text node-run-error">{{ selectedNodeRun.errorMessage }}</pre>
              </template>
              <div v-if="selectedNodeRun.childExecutionId" class="panel-meta">
                <el-button
                  size="small"
                  link
                  type="primary"
                  @click="openChildExecution(selectedNodeRun.childExecutionId)"
                >
                  {{
                    t('agent.subgraphChildExecutionLink', {
                      id: selectedNodeRun.childExecutionId,
                    })
                  }}
                </el-button>
              </div>
            </el-tab-pane>
          </el-tabs>

          <div class="panel-footer">
            <el-button
              v-if="RUNNABLE_NODE_TYPES.includes(selectedNodeType)"
              size="small"
              type="primary"
              plain
              @click="openSingleNodeDialog"
            >
              {{ t('agent.runNode') }}
            </el-button>
            <el-button
              v-if="selectedNodeType !== NODE_TYPE_START"
              size="small"
              type="danger"
              plain
              @click="removeSelectedNode"
            >
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

    <!-- 单节点运行（G1-8 调试语义，不产生正式执行记录） -->
    <el-dialog v-model="singleNodeDialogVisible" :title="t('agent.runNode')" width="480px">
      <div class="insert-hint">{{ t('agent.runNodeHint') }}</div>
      <div class="panel-field__label">{{ t('agent.nodeRunInputsTitle') }}</div>
      <div v-for="name in singleNodeVariableNames" :key="name" class="single-run-field">
        <span class="single-run-field__name">{{ name }}</span>
        <el-input
          v-model="singleNodeInputs[name]"
          size="small"
          :placeholder="t('agent.nodeRunInputPlaceholder')"
        />
      </div>
      <el-alert
        v-if="singleNodeResult"
        :title="
          singleNodeResult.success ? t('agent.nodeStatusSuccess') : t('agent.nodeStatusFailed')
        "
        :type="singleNodeResult.success ? 'success' : 'error'"
        :closable="false"
        show-icon
        class="execute-result"
      >
        <div v-if="singleNodeResult.output" class="node-run-text">
          {{ singleNodeResult.output }}
        </div>
        <div v-if="singleNodeResult.errorMessage" class="node-run-text node-run-error">
          {{ singleNodeResult.errorMessage }}
        </div>
        <div class="execute-meta">
          {{ t('agent.nodeRunLatency') }}：{{ singleNodeResult.latencyMs }}ms
        </div>
      </el-alert>
      <template #footer>
        <el-button size="small" @click="singleNodeDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button
          size="small"
          type="primary"
          :loading="singleNodeRunning"
          @click="confirmSingleNodeRun"
        >
          {{ t('agent.run') }}
        </el-button>
      </template>
    </el-dialog>

    <HumanTaskSubmitDialog
      v-model="humanTaskDialogVisible"
      :task="waitingHumanTask"
      @submitted="handleHumanTaskSubmitted"
    />

    <!-- 执行测试面板（结果不落库，刷新即失） -->
    <div class="execute-panel">
      <div class="execute-row">
        <span class="execute-label">{{ t('agent.runTest') }}</span>
        <el-input
          v-if="startParams.length === 0"
          v-model="executeInput"
          :placeholder="t('agent.testTextPlaceholder')"
          style="width: 360px"
          size="small"
        />
        <span v-else class="execute-label">{{ t('agent.structuredInputsTitle') }}</span>
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
        <el-tag v-if="lifecycleStatus" type="info" size="small">
          {{ lifecycleStatusLabel }}
        </el-tag>
      </div>
      <!-- G3-6：等待人工处理，直接在当前页提交 -->
      <div v-if="lifecycleStatus === 'WAITING_HUMAN'" class="human-waiting-card">
        <div class="human-waiting-card__text">
          <div class="human-waiting-card__title">
            {{ t('agent.humanWaitingFor', { assignee: waitingAssigneeLabel }) }}
          </div>
          <div v-if="waitingHumanTask?.instructions" class="human-waiting-card__hint">
            {{ waitingHumanTask.instructions }}
          </div>
          <div v-else-if="waitingHumanTask" class="human-waiting-card__hint">
            {{ t('agent.humanTaskNode') }}：{{ waitingHumanTask.nodeId }}
          </div>
        </div>
        <el-button
          v-if="waitingHumanTask"
          size="small"
          type="primary"
          @click="humanTaskDialogVisible = true"
        >
          {{ t('agent.humanInboxOpen') }}
        </el-button>
      </div>
      <!-- G1-4：开始节点参数声明 → 结构化入参表单 -->
      <div v-if="startParams.length > 0" class="params-form">
        <div v-for="param in startParams" :key="param.name" class="param-field">
          <span class="param-field__label">
            {{ param.name }}<span v-if="param.required" class="param-required">*</span>
          </span>
          <el-switch
            v-if="param.type === 'boolean'"
            :model-value="paramValue(param.name) === true"
            @update:model-value="(value) => setParamValue(param.name, value === true)"
          />
          <el-input
            v-else
            :model-value="String(paramValue(param.name) ?? '')"
            :type="param.type === 'json' ? 'textarea' : 'text'"
            :rows="param.type === 'json' ? 2 : undefined"
            :placeholder="param.description || t('agent.nodeRunInputPlaceholder')"
            size="small"
            style="width: 280px"
            @update:model-value="(value) => setParamValue(param.name, String(value))"
          />
        </div>
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

.human-waiting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  margin-top: 8px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 4px;
}

.human-waiting-card__title {
  font-size: 13px;
  font-weight: 600;
}

.human-waiting-card__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.execute-panel {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 12px;
}

.params-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 10px;
}

.param-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.param-field__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.param-required {
  color: var(--el-color-danger);
  margin-left: 2px;
}

.single-run-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.single-run-field__name {
  width: 110px;
  flex: none;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.node-run-text {
  margin: 4px 0;
  padding: 6px 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.node-run-error {
  color: var(--el-color-danger);
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

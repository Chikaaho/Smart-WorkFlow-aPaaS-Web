<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { i18n, useI18n } from '@/locales'

const { t } = useI18n()
/* global HTMLElement */
/**
 * GraphDesigner — 图设计器画布页（参数化静态路由 agent/graph-designer/:id）。
 *
 * 生命周期：getGraph(id) → elementsToFlowGraphData → mountFlowGraph（flow-graph 防腐层）。
 * 编辑：onGraphChange 回调持有最新 FlowGraphData；节点点击打开属性面板——START/END
 * 无可编辑项；LLM 模型配置下拉写 data.agentModelConfigId；TOOL 工具下拉（internal/
 * external 合并、value=toolName 精确值）写 data.toolName；LLM/TOOL 另有「输入变量名/
 * 输出变量名」输入项写 data.inputVar/data.outputVar（后端 config 契约键，留空 = 默认
 * 变量 input，不落键）；CONDITION 节点选中时列出其出边，逐边编辑关键词（写
 * edge.label，画布原生渲染边标签）；LOOP 节点「最大迭代次数」数字输入写
 * data.maxIterations（Integer ≥1，空值/非数字删键，<1 提示不写入，缺省后端默认 10）；
 * FORK/JOIN 无 config 编辑项，仅静态说明文本（分支语义落在出/入边）。
 * 保存草稿：flowGraphDataToElements → saveDraftGraph（全量覆盖，不跑校验）。
 * 发布：publish(id) 生成新版本快照，**不锁编辑**（Step7 语义：发布后仍可继续编辑
 * 并再次发布）。
 * 执行测试：execute(id, input) → 展示 success/output/errorMessage/latencyMs，
 * **不落库**，刷新页面即丢失（对齐 Step8「执行不落库」限制）。
 *
 * 说明：flow-graph adapter 契约无 edge 点击事件，条件边关键词编辑放在 CONDITION
 * 节点属性面板内（列出其出边逐条编辑），不走边选中交互。
 * 属性面板按节点类型查 NODE_PANEL_REGISTRY（panels/node-panel-registry.ts）动态挂载，
 * 各类型面板为独立组件（panels/*.vue），新增节点类型 = 加一条描述符，本组件零改。
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { mountFlowGraph } from '@/adapters/flow-graph'
import type {
  FlowGraphData,
  FlowGraphEdge,
  FlowGraphEvents,
  FlowGraphInstance,
  FlowGraphNode,
} from '@/adapters/flow-graph'
import {
  executeGraph,
  getGraphDef,
  listModelOptions,
  listToolOptions,
  publishGraphDef,
  saveDraftGraph,
} from '@/modules/agent/api'
import {
  NODE_CONFIG_KEY_MAX_ITERATIONS,
  NODE_TYPE_CONDITION,
  NODE_TYPE_END,
  NODE_TYPE_FORK,
  NODE_TYPE_JOIN,
  NODE_TYPE_LLM,
  NODE_TYPE_LOOP,
  NODE_TYPE_START,
  NODE_TYPE_TOOL,
  elementsToFlowGraphData,
  flowGraphDataToElements,
  nodeTypeLabel,
} from '@/modules/agent/utils/graphAdapter'
import { getNodePanelDescriptor } from './panels/node-panel-registry'
import type {
  AgentGraphExecuteResp,
  AgentModelConfigOption,
  AgentToolOption,
  ProcessGraph,
} from '@/contracts/agent'
import { ApiError } from '@/foundation/request'

const route = useRoute()
const router = useRouter()

const graphId = computed(() => Number(route.params.id as string))

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

// ─── 属性面板 ───
const selectedNodeId = ref<string | null>(null)
const modelOptions = ref<AgentModelConfigOption[]>([])
const toolOptions = ref<AgentToolOption[]>([])

// ─── 执行测试面板 ───
const executeInput = ref('')
const executeResult = ref<AgentGraphExecuteResp | null>(null)
const executing = ref(false)

const saving = ref(false)
const publishing = ref(false)

const selectedNode = computed<FlowGraphNode | null>(
  () => graphData.value.nodes.find((n) => n.id === selectedNodeId.value) ?? null,
)

const selectedNodeType = computed(() => selectedNode.value?.type ?? '')

/** CONDITION 节点出边（条件分支关键词编辑入口） */
const conditionOutEdges = computed<FlowGraphEdge[]>(() => {
  if (selectedNodeType.value !== NODE_TYPE_CONDITION || !selectedNode.value) return []
  return graphData.value.edges.filter((e) => e.source === selectedNode.value?.id)
})

/**
 * 属性面板组件：按节点类型查 NODE_PANEL_REGISTRY 动态挂载（<component :is>）。
 * 注册表缺描述符的类型 → 无面板（仅保留删除按钮），消费方零 if/switch。
 */
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
]

// ─── 画布事件 ───

const graphEvents: FlowGraphEvents = {
  onNodeClick: (node: FlowGraphNode) => {
    selectedNodeId.value = node.id
  },
  onGraphChange: (data: FlowGraphData) => {
    graphData.value = data
  },
}

function remountCanvas() {
  if (graphInstance.value) {
    graphInstance.value.destroy()
    graphInstance.value = null
  }
  if (canvasRef.value) {
    graphInstance.value = mountFlowGraph(canvasRef.value, graphData.value, graphEvents)
  }
}

// ─── 节点操作 ───

/** 属性面板左侧色板：新增节点（画布外数据变更 → 重挂载画布） */
function addNode(type: string) {
  const count = graphData.value.nodes.length
  const node: FlowGraphNode = {
    id: `n-${Date.now()}-${count}`,
    type,
    label: nodeTypeLabel(type),
    position: { x: 60 + (count % 5) * 100, y: 60 + Math.floor(count / 5) * 80 },
    data: {},
  }
  graphData.value = { nodes: [...graphData.value.nodes, node], edges: [...graphData.value.edges] }
  remountCanvas()
}

/** 删除节点（连带其入/出边）；START 不可删（执行契约要求唯一 START） */
function removeSelectedNode() {
  const node = selectedNode.value
  if (!node) return
  if (node.type === NODE_TYPE_START) return
  graphData.value = {
    nodes: graphData.value.nodes.filter((n) => n.id !== node.id),
    edges: graphData.value.edges.filter((e) => e.source !== node.id && e.target !== node.id),
  }
  selectedNodeId.value = null
  remountCanvas()
}

/** 删除条件分支出边 */
function removeEdge(edgeId: string) {
  graphData.value = {
    nodes: [...graphData.value.nodes],
    edges: graphData.value.edges.filter((e) => e.id !== edgeId),
  }
  remountCanvas()
}

/**
 * 属性面板数据回写：LLM/TOOL 节点业务配置（画布不渲染 data，无需重挂载）。
 * value 为 undefined 时删除键（config 不携带空值，与 handleVarNameChange 空白删键
 * 语义对齐；空白不落键，避免歧义数据）。
 */
function updateNodeData(key: string, value: unknown) {
  const node = graphData.value.nodes.find((n) => n.id === selectedNodeId.value)
  if (!node) return
  if (value === undefined) {
    const next = { ...(node.data ?? {}) }
    delete next[key]
    node.data = next
  } else {
    node.data = { ...(node.data ?? {}), [key]: value }
  }
}

/**
 * 变量名输入项写回：trim 后非空经 updateNodeData 写入 data（与后端 resolveVarName
 * 宽松语义对齐）；空白 = 未指定 = 默认变量，直接移除键（config 不携带空串，
 * graph_json 零迁移干净落库）。
 */
function handleVarNameChange(key: string, value: unknown) {
  const name = String(value ?? '').trim()
  if (name === '') {
    const node = graphData.value.nodes.find((n) => n.id === selectedNodeId.value)
    if (!node) return
    const next = { ...(node.data ?? {}) }
    delete next[key]
    node.data = next
  } else {
    updateNodeData(key, name)
  }
}

/**
 * LOOP maxIterations 写回（对齐后端契约：Integer ≥1，后端缺省默认 10）：
 * 空值/非数字删键（config 不携带非法值，零迁移落库）；<1 或非整数提示且不写入。
 */
function handleMaxIterationsChange(value: unknown) {
  const text = String(value ?? '').trim()
  const node = graphData.value.nodes.find((n) => n.id === selectedNodeId.value)
  if (!node) return
  const removeKey = () => {
    const next = { ...(node.data ?? {}) }
    delete next[NODE_CONFIG_KEY_MAX_ITERATIONS]
    node.data = next
  }
  if (text === '') {
    removeKey()
    return
  }
  const parsed = Number(text)
  if (Number.isNaN(parsed)) {
    removeKey()
    return
  }
  if (parsed < 1 || !Number.isInteger(parsed)) {
    ElMessage.warning(t('agent.loopMaxIterationsInvalid'))
    removeKey()
    return
  }
  updateNodeData(NODE_CONFIG_KEY_MAX_ITERATIONS, parsed)
}

/** 条件边关键词写 edge.label（画布原生渲染边标签，改后重挂载使画布可见） */
function handleKeywordChange(edge: FlowGraphEdge, value: unknown) {
  const target = graphData.value.edges.find((e) => e.id === edge.id)
  if (!target) return
  const keyword = String(value ?? '').trim()
  target.label = keyword === '' ? undefined : keyword
  remountCanvas()
}

function edgeDisplayName(edge: FlowGraphEdge): string {
  const from = graphData.value.nodes.find((n) => n.id === edge.source)
  const to = graphData.value.nodes.find((n) => n.id === edge.target)
  return `${from?.label ?? edge.source} → ${to?.label ?? edge.target}`
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
    // 节点显示名：按类型映射（仅展示用途，不落库）
    graphData.value = {
      nodes: data.nodes.map((n) => ({ ...n, label: nodeTypeLabel(n.type ?? '') })),
      edges: data.edges,
    }
    await nextTick()
    if (canvasRef.value) {
      graphInstance.value = mountFlowGraph(canvasRef.value, graphData.value, graphEvents)
    }
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('agent.graphDefLoadFailed')
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  try {
    const [models, tools] = await Promise.all([listModelOptions(), listToolOptions()])
    modelOptions.value = models
    toolOptions.value = tools
  } catch (err) {
    ElMessage.warning(
      t('agent.dropdownLoadFailed') + ((err as ApiError).msg ?? t('common.unknownError')),
    )
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

async function handleExecute() {
  const input = executeInput.value.trim()
  if (!input) {
    ElMessage.warning(t('agent.testTextRequired'))
    return
  }
  executing.value = true
  executeResult.value = null
  try {
    executeResult.value = await executeGraph(graphId.value, input)
  } catch (err) {
    executeResult.value = {
      success: false,
      errorMessage: err instanceof ApiError ? err.msg : t('agent.executionFailed'),
      latencyMs: 0,
    }
  } finally {
    executing.value = false
  }
}

/** 从图设计器直达本次执行详情（Step12：利用响应中的 executionId） */
function handleViewExecutionDetail() {
  const eid = executeResult.value?.executionId
  if (eid) {
    void router.push(`/agent/executions/detail/${eid}`)
  } else {
    ElMessage.warning(t('agent.noExecutionToJumpTo'))
  }
}

onMounted(() => {
  void loadGraph()
  void loadOptions()
})

onBeforeUnmount(() => {
  if (graphInstance.value) {
    graphInstance.value.destroy()
    graphInstance.value = null
  }
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
      <!-- 节点色板 -->
      <div class="palette">
        <div class="palette-title">{{ t('common.node') }}</div>
        <el-button
          v-for="type in NODE_TYPES"
          :key="type"
          size="small"
          class="palette-item"
          @click="addNode(type)"
        >
          {{ nodeTypeLabel(type) }}
        </el-button>
      </div>

      <!-- 画布 -->
      <div class="canvas-wrap">
        <div ref="canvasRef" class="canvas" />
      </div>

      <!-- 属性面板 -->
      <div class="property-panel">
        <template v-if="selectedNode">
          <div class="panel-title">
            {{ t('agent.nodeProperties') }}
            <span class="panel-sub">{{ enumLabel('AGENT_NODE_TYPE', selectedNode.type) }}</span>
          </div>

          <!-- 面板主体：按节点类型查 NODE_PANEL_REGISTRY 动态挂载（无 if/switch 链） -->
          <component
            :is="panelComponent"
            v-if="panelComponent"
            :node="selectedNode"
            :label="panelLabel"
            :model-options="modelOptions"
            :tool-options="toolOptions"
            :condition-out-edges="conditionOutEdges"
            :edge-display-name="edgeDisplayName"
            @update-node-data="updateNodeData"
            @var-name-change="handleVarNameChange"
            @max-iterations-change="handleMaxIterationsChange"
            @keyword-change="handleKeywordChange"
            @remove-edge="removeEdge"
          />

          <!-- 删除节点（START 除外） -->
          <div v-if="selectedNodeType !== NODE_TYPE_START" class="panel-footer">
            <el-button size="small" type="danger" plain @click="removeSelectedNode">
              {{ t('agent.deleteNode') }}
            </el-button>
          </div>
        </template>
        <el-empty v-else :description="t('agent.clickNodeToEditHint')" :image-size="60" />
      </div>
    </div>

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
      </div>
      <el-alert
        v-if="executeResult"
        :title="executeResult.success ? t('agent.executionSucceeded') : t('agent.executionFailed')"
        :type="executeResult.success ? 'success' : 'error'"
        :closable="false"
        show-icon
        class="execute-result"
      >
        <template v-if="executeResult.success && executeResult.output">
          <div>{{ t('agent.outputLabel', { output: executeResult.output }) }}</div>
        </template>
        <template v-else-if="!executeResult.success && executeResult.errorMessage">
          <div>{{ t('agent.reasonLabel', { errorMessage: executeResult.errorMessage }) }}</div>
        </template>
        <div class="execute-meta">
          {{ t('agent.latencyLabel', { latencyMs: executeResult.latencyMs }) }}
        </div>
        <!-- Step12：利用响应中的 executionId 直达本次执行详情 -->
        <div v-if="executeResult.executionId" class="execute-detail-link">
          <el-button size="small" link type="primary" @click="handleViewExecutionDetail">
            {{ t('agent.viewExecution') }}
          </el-button>
        </div>
      </el-alert>
      <div class="execute-hint">{{ t('agent.executionResultPersisted') }}</div>
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
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.designer-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 12px;
}

.palette {
  width: 96px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow-y: auto;
}

.palette-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.palette-item {
  width: 100%;
}

.canvas-wrap {
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

.property-panel {
  width: 280px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 12px;
  overflow-y: auto;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.panel-sub {
  margin-left: 8px;
  font-weight: 400;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.panel-footer {
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color-light);
  padding-top: 12px;
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

.execute-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

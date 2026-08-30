<script setup lang="ts">
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
  NODE_TYPE_LABELS,
  NODE_TYPE_LLM,
  NODE_TYPE_LOOP,
  NODE_TYPE_START,
  NODE_TYPE_TOOL,
  elementsToFlowGraphData,
  flowGraphDataToElements,
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
const panelLabel = computed(() => panelDescriptor.value?.label ?? selectedNodeType.value)

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
    label: NODE_TYPE_LABELS[type] ?? type,
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
    ElMessage.warning('LOOP 节点 maxIterations 必须 ≥ 1')
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
      nodes: data.nodes.map((n) => ({ ...n, label: NODE_TYPE_LABELS[n.type ?? ''] ?? n.type })),
      edges: data.edges,
    }
    await nextTick()
    if (canvasRef.value) {
      graphInstance.value = mountFlowGraph(canvasRef.value, graphData.value, graphEvents)
    }
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : '加载图定义失败'
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
    ElMessage.warning('下拉数据加载失败：' + ((err as ApiError).msg ?? '未知错误'))
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
    ElMessage.success('草稿已保存')
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '保存草稿失败')
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
    ElMessage.success(`发布成功，当前版本 v${published.defVersion}（发布后可继续编辑并再次发布）`)
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '发布失败')
  } finally {
    publishing.value = false
  }
}

async function handleExecute() {
  const input = executeInput.value.trim()
  if (!input) {
    ElMessage.warning('请输入测试文本')
    return
  }
  executing.value = true
  executeResult.value = null
  try {
    executeResult.value = await executeGraph(graphId.value, input)
  } catch (err) {
    executeResult.value = {
      success: false,
      errorMessage: err instanceof ApiError ? err.msg : '执行失败',
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
    ElMessage.warning('暂无可跳转的执行记录')
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
        <span class="title-text">{{ graphName || '未命名图' }}</span>
        <el-tag v-if="version" size="small" type="info">v{{ version }}</el-tag>
      </div>
      <div class="header-actions">
        <el-button size="small" @click="router.push('/agent/graph-def')">返回列表</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="handleSaveDraft">
          保存草稿
        </el-button>
        <el-button size="small" type="success" :loading="publishing" @click="handlePublish">
          发布
        </el-button>
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
        <div class="palette-title">节点</div>
        <el-button
          v-for="type in NODE_TYPES"
          :key="type"
          size="small"
          class="palette-item"
          @click="addNode(type)"
        >
          {{ NODE_TYPE_LABELS[type] ?? type }}
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
            节点属性
            <span class="panel-sub">{{ selectedNode.type }}</span>
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
              删除节点
            </el-button>
          </div>
        </template>
        <el-empty v-else description="点击画布节点编辑属性" :image-size="60" />
      </div>
    </div>

    <!-- 执行测试面板（结果不落库，刷新即失） -->
    <div class="execute-panel">
      <div class="execute-row">
        <span class="execute-label">执行测试</span>
        <el-input
          v-model="executeInput"
          placeholder="输入测试文本（图须已发布）"
          style="width: 360px"
          size="small"
        />
        <el-button type="primary" size="small" :loading="executing" @click="handleExecute">
          运行
        </el-button>
      </div>
      <el-alert
        v-if="executeResult"
        :title="executeResult.success ? '执行成功' : '执行失败'"
        :type="executeResult.success ? 'success' : 'error'"
        :closable="false"
        show-icon
        class="execute-result"
      >
        <template v-if="executeResult.success && executeResult.output">
          <div>输出：{{ executeResult.output }}</div>
        </template>
        <template v-else-if="!executeResult.success && executeResult.errorMessage">
          <div>原因：{{ executeResult.errorMessage }}</div>
        </template>
        <div class="execute-meta">耗时 {{ executeResult.latencyMs }}ms</div>
        <!-- Step12：利用响应中的 executionId 直达本次执行详情 -->
        <div v-if="executeResult.executionId" class="execute-detail-link">
          <el-button size="small" link type="primary" @click="handleViewExecutionDetail">
            查看详情 →
          </el-button>
        </div>
      </el-alert>
      <div class="execute-hint">执行结果已持久化，可通过上方按钮直达本次执行详情。</div>
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

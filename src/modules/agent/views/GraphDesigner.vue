<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
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
 *
 * 结构：图数据/选中态等核心 ref 与保存/发布/加载编排保留在本文件；
 * 画布/选项/执行等派生逻辑在 use-graph-* 组合式函数，
 * 头部/节点面板/属性面板/对话框/执行面板在 Graph* 子组件。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FlowGraphData } from '@/adapters/flow-graph'
import { getGraphDef, publishGraphDef, saveDraftGraph } from '@/modules/agent/api'
import type { ProcessGraph } from '@/contracts/agent'
import HumanTaskSubmitDialog from '@/modules/agent/components/execution/HumanTaskSubmitDialog.vue'
import {
  elementsToFlowGraphData,
  flowGraphDataToElements,
  nodeTypeLabel,
} from '@/modules/agent/utils/graphAdapter'
import { validateGraphVariables } from '@/modules/agent/utils/variableReferences'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { parseRouteId } from '@/modules/agent/utils/routeId'
import GraphHeaderBar from './GraphHeaderBar.vue'
import GraphPalettePanel from './GraphPalettePanel.vue'
import GraphPropertyPanel from './GraphPropertyPanel.vue'
import GraphInsertNodeDialog from './GraphInsertNodeDialog.vue'
import GraphSingleNodeRunDialog from './GraphSingleNodeRunDialog.vue'
import GraphExecutePanel from './GraphExecutePanel.vue'
import { useGraphSelection } from './use-graph-selection'
import { useGraphOptions } from './use-graph-options'
import { useGraphCanvas } from './use-graph-canvas'
import { useGraphExecution } from './use-graph-execution'

const route = useRoute()
const router = useRouter()

const graphId = computed(() => parseRouteId(route.params.id))

// G1-9 权限与空态：只有 agent:model:manage 才能改图/发布/试运行；否则整页只读（可看、可看运行记录）
const canEdit = computed(() => hasPerm('agent:model:manage'))

// ─── 图状态 ───
const graphName = ref('')
const graphKey = ref('')
const version = ref<number | null>(null)
const graphData = ref<FlowGraphData>({ nodes: [], edges: [] })
const loading = ref(false)
const loadError = ref('')

// ─── 选择与属性面板 ───
const selectedNodeId = ref<string | null>(null)
const selectedEdgeId = ref<string | null>(null)

/* ── 选中态派生（面板描述符/连接页签/变量组） ── */
const {
  selectedNode,
  selectedEdge,
  selectedNodeType,
  incomingEdges,
  outgoingEdges,
  conditionOutEdges,
  panelComponent,
  panelLabel,
  variableGroups,
  activeNodeTab,
  edgeDisplayName,
} = useGraphSelection({ graphData, selectedNodeId, selectedEdgeId })

/* ── 属性面板选项与展示元数据上下文 ── */
const {
  modelOptions,
  toolOptions,
  knowledgeOptions,
  graphOptions,
  userOptions,
  subgraphVersions,
  presentationCtx,
  loadSubgraphVersions,
  loadOptions,
} = useGraphOptions({ graphId, graphData, selectedNode, selectedNodeType })

/* ── 画布编排（适配层实例/历史/节点连线操作/插入/缩放） ── */
const {
  setCanvasRef,
  zoomPercent,
  canUndo,
  canRedo,
  insertDialogVisible,
  insertHint,
  mountCanvas,
  resetHistory,
  undo,
  redo,
  addNode,
  removeSelectedNode,
  removeEdge,
  updateNodeData,
  handleVarNameChange,
  handleMaxIterationsChange,
  handleKeywordChange,
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
} = useGraphCanvas({
  graphData,
  selectedNode,
  selectedNodeId,
  selectedEdgeId,
  canEdit,
  presentationCtx,
})

/* ── 执行测试面板与单节点运行 ── */
const {
  executeInput,
  executeResult,
  executing,
  lifecycleStatus,
  lifecycleStatusLabel,
  streamedOutput,
  lastSequence,
  selectedNodeRun,
  nodeStatusLabel,
  startParams,
  paramValue,
  setParamValue,
  waitingHumanTask,
  humanTaskDialogVisible,
  waitingAssigneeLabel,
  singleNodeDialogVisible,
  singleNodeInputs,
  singleNodeResult,
  singleNodeRunning,
  singleNodeVariableNames,
  showExecutionLatency,
  executeAlertType,
  executeAlertTitle,
  refreshExecution,
  handleHumanTaskSubmitted,
  handleExecute,
  handleCancelExecution,
  handleViewExecutionDetail,
  openSingleNodeDialog,
  confirmSingleNodeRun,
  openChildExecution,
} = useGraphExecution({
  graphId,
  graphData,
  selectedNode,
  selectedNodeId,
  userOptions,
  router,
  applyNodeRunStatus,
})

const saving = ref(false)
const publishing = ref(false)

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
    resetHistory()
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('agent.graphDefLoadFailed')
  } finally {
    loading.value = false
  }
}

// ─── 保存草稿 / 发布 ───

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

onMounted(() => {
  void loadGraph()
  void loadOptions(() => refreshAllPresentations())
})

/* 轮询序号与轮询刷新由执行组合式函数维护；顶层绑定供测试经 vm 直访。 */
defineExpose({ lastSequence, refreshExecution })
</script>

<template>
  <div class="graph-designer">
    <!-- 头部 -->
    <GraphHeaderBar
      :graph-name="graphName"
      :version="version"
      :can-edit="canEdit"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :saving="saving"
      :publishing="publishing"
      @undo="undo"
      @redo="redo"
      @auto-layout="handleAutoLayout"
      @save-draft="handleSaveDraft"
      @publish="handlePublish"
    />

    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      :closable="false"
      show-icon
      style="margin: 16px"
    />

    <div v-else v-loading="loading" class="designer-body">
      <el-alert
        v-if="!canEdit"
        :title="t('agent.readOnlyMode')"
        :description="t('agent.readOnlyRunRecordsHint')"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 8px"
      />
      <!-- 节点面板（G1-9 无编辑权限时隐藏） -->
      <GraphPalettePanel v-if="canEdit" :drag-start="onPaletteDragStart" :add-node="addNode" />

      <!-- 画布 -->
      <div class="canvas-wrap" @dragover.prevent @drop="onCanvasDrop">
        <div :ref="setCanvasRef" class="canvas" />
        <div class="zoom-bar">
          <button type="button" :aria-label="t('agent.zoomOut')" @click="handleZoomOut">−</button>
          <span class="zoom-value" title="点击恢复 100%" @click="resetZoom">
            {{ zoomPercent }}%
          </span>
          <button type="button" :aria-label="t('agent.zoomIn')" @click="handleZoomIn">+</button>
          <button type="button" class="zoom-fit" @click="handleFitView">
            {{ t('agent.zoomFit') }}
          </button>
        </div>
      </div>

      <!-- 属性面板（G1-9 无编辑权限时隐藏，避免只读用户改配置） -->
      <GraphPropertyPanel
        v-if="canEdit"
        v-model:active-node-tab="activeNodeTab"
        :selected-edge="selectedEdge"
        :selected-node="selectedNode"
        :selected-node-type="selectedNodeType"
        :panel-component="panelComponent"
        :panel-label="panelLabel"
        :model-options="modelOptions"
        :tool-options="toolOptions"
        :knowledge-options="knowledgeOptions"
        :condition-out-edges="conditionOutEdges"
        :edge-display-name="edgeDisplayName"
        :variable-groups="variableGroups"
        :user-options="userOptions"
        :graph-options="graphOptions"
        :subgraph-versions="subgraphVersions"
        :incoming-edges="incomingEdges"
        :outgoing-edges="outgoingEdges"
        :selected-node-run="selectedNodeRun"
        :node-status-label="nodeStatusLabel"
        @select-edge="selectedEdgeId = $event"
        @update-node-data="updateNodeData"
        @subgraph-graph-change="loadSubgraphVersions"
        @var-name-change="handleVarNameChange"
        @max-iterations-change="handleMaxIterationsChange"
        @keyword-change="handleKeywordChange"
        @remove-edge="removeEdge"
        @remove-node="removeSelectedNode"
        @open-node-run="openSingleNodeDialog"
        @open-child-execution="openChildExecution"
      />
    </div>

    <!-- 插入节点类型选择 -->
    <GraphInsertNodeDialog
      v-model:visible="insertDialogVisible"
      :hint="insertHint"
      @confirm="confirmInsert"
    />

    <!-- 单节点运行（G1-8 调试语义，不产生正式执行记录） -->
    <GraphSingleNodeRunDialog
      v-model:visible="singleNodeDialogVisible"
      :variable-names="singleNodeVariableNames"
      :inputs="singleNodeInputs"
      :result="singleNodeResult"
      :running="singleNodeRunning"
      @update-input="(name, value) => (singleNodeInputs[name] = value)"
      @confirm="confirmSingleNodeRun"
    />

    <HumanTaskSubmitDialog
      v-model="humanTaskDialogVisible"
      :task="waitingHumanTask"
      @submitted="handleHumanTaskSubmitted"
    />

    <!-- 执行测试面板（结果不落库，刷新即失；G1-9 无编辑权限不能运行，隐藏） -->
    <GraphExecutePanel
      v-if="canEdit"
      v-model:execute-input="executeInput"
      :executing="executing"
      :execute-result="executeResult"
      :lifecycle-status="lifecycleStatus"
      :lifecycle-status-label="lifecycleStatusLabel"
      :start-params="startParams"
      :streamed-output="streamedOutput"
      :show-execution-latency="showExecutionLatency"
      :execute-alert-type="executeAlertType"
      :execute-alert-title="executeAlertTitle"
      :waiting-human-task="waitingHumanTask"
      :waiting-assignee-label="waitingAssigneeLabel"
      :param-value="paramValue"
      @set-param-value="(name, value) => setParamValue(name, value)"
      @execute="handleExecute"
      @cancel-execution="handleCancelExecution"
      @view-detail="handleViewExecutionDetail"
      @open-human-task-dialog="humanTaskDialogVisible = true"
    />
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

.designer-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 12px;
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
</style>

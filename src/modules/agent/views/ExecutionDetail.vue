<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ExecutionDetail — 图执行详情页
 *
 * 展示单次图执行的完整信息：
 * - 返回按钮 + 基本信息（graphName、defVersion、状态、耗时）
 * - 输入内容 / 输出内容（大字段可折叠）
 * - 错误信息（失败时展示）
 * - 时间信息（创建时间 / 更新时间）
 * - 节点轨迹子视图
 *
 * 数据加载策略：
 * 1. onMounted 调用 getExecutionDetail(executionId)
 * 2. 若响应含 nodeDetails，直接用；否则单独调用 listExecutionNodes(executionId)
 * 3. 大字段（input/output）可考虑折叠防卡顿
 *
 * 状态映射：
 * - RUNNING → info (warning)
 * - SUCCESS → success
 * - FAILED → danger
 *
 * 安全渲染:
 * - ❌ 禁止直接 v-html
 * - ✅ 使用 SafeHtml 组件或 Vue 自动转义的插值表达式
 *
 * 权限控制：
 * - 页面级：通过菜单驱动路由权限控制 (agent:model:view)
 * - 跳转返回列表时携带当前 graphDefId 过滤条件
 *
 * 404 处理:
 * - executionId 不存在或跨租户 → HTTP 404 → 路由到 /404 页
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getExecutionDetail,
  getGraphDef,
  getGraphExecutionLifecycle,
  listExecutionHumanTasks,
  listExecutionNodes,
} from '@/modules/agent/api'
import type {
  AgentGraphExecutionDetail,
  AgentGraphExecutionNode,
  AgentHumanTask,
} from '@/contracts/agent'
import type { AgentExecutionLifecycle } from '@/modules/agent/api'
import HumanTaskSubmitDialog from '@/modules/agent/components/execution/HumanTaskSubmitDialog.vue'
import { ApiError } from '@/foundation/request'
import { parseRouteId } from '@/modules/agent/utils/routeId'
import { sumTokens, toTokenNumber } from '@/modules/agent/utils/token'
import NodeTrajectory from '@/modules/agent/components/execution/NodeTrajectory.vue'
import SafeHtml from '@/security/SafeHtml.vue'

const route = useRoute()
const router = useRouter()

// ─── 路由参数 ───
const executionId = computed(() => parseRouteId(route.params.executionId))

// ─── W5 统一执行编号 ───
/** 生命周期受理行（executionId=受理编号，resultExecutionId=执行编号） */
const lifecycleState = ref<AgentExecutionLifecycle | null>(null)
/** 页面统一展示执行编号：优先结果执行 id（与列表/待办一致） */
const displayExecutionId = computed(
  () => lifecycleState.value?.resultExecutionId ?? executionId.value,
)
const acceptedExecutionId = computed(() => lifecycleState.value?.executionId ?? null)

// ─── 状态变量 ───
const loading = ref(false)
const error = ref<string | null>(null)
const detail = ref<AgentGraphExecutionDetail | null>(null)
const nodes = ref<AgentGraphExecutionNode[]>([])

// ─── G3 人工任务 ───
const humanTasks = ref<AgentHumanTask[]>([])
const humanDialogVisible = ref(false)
const activeHumanTask = ref<AgentHumanTask | null>(null)

async function loadHumanTasks() {
  try {
    // W5：任务行按受理编号查询（服务端已兼容执行编号入参，双保险）
    const queryId = lifecycleState.value?.executionId ?? executionId.value
    humanTasks.value = (await listExecutionHumanTasks(queryId)) ?? []
  } catch {
    humanTasks.value = []
  }
}

function openHumanTask(task: AgentHumanTask) {
  activeHumanTask.value = task
  humanDialogVisible.value = true
}

function handleHumanSubmitted() {
  activeHumanTask.value = null
  void loadDetail()
}

// ─── 状态映射 ───
const STATUS_MAP: Record<
  string,
  { label: string; type: 'success' | 'warning' | 'info' | 'danger' | '' }
> = {
  RUNNING: {
    get label() {
      return t('common.statusRunning')
    },
    type: 'warning',
  },
  QUEUED: {
    get label() {
      return t('agent.nodeStatusWaiting')
    },
    type: 'info',
  },
  WAITING_HUMAN: {
    get label() {
      return t('agent.humanTaskWaitStatus')
    },
    type: 'warning',
  },
  SUCCESS: {
    get label() {
      return t('common.resultSuccess')
    },
    type: 'success',
  },
  FAILED: {
    get label() {
      return t('common.resultFailed')
    },
    type: 'danger',
  },
  CANCELLED: {
    get label() {
      return t('workflow.runtimeStateCancelled')
    },
    type: 'info',
  },
  INTERRUPTED: {
    get label() {
      return t('agent.executionInterrupted')
    },
    type: 'info',
  },
}

function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status
}

/** P70/B3：人工任务行状态标签中文化（PENDING/已提交/已关闭/已超时）。 */
const HUMAN_TASK_STATUS_KEYS: Record<string, string> = {
  PENDING: 'agent.humanTaskPending',
  SUBMITTED: 'agent.humanTaskStatusSubmitted',
  CANCELLED: 'agent.humanTaskStatusCancelled',
  TIMEOUT: 'agent.humanTaskStatusTimeout',
}

function humanTaskStatusLabel(status: string): string {
  const key = HUMAN_TASK_STATUS_KEYS[status]
  return key ? t(key) : status
}

function getStatusType(status: string): 'success' | 'warning' | 'info' | 'danger' | '' {
  return (STATUS_MAP[status]?.type || '') as 'success' | 'warning' | 'info' | 'danger' | ''
}

// ─── 格式化函数 ───
function formatLatency(latencyMs: number): string {
  if (latencyMs < 1000) {
    return `${latencyMs}ms`
  }
  const seconds = latencyMs / 1000
  return seconds < 60 ? `${seconds.toFixed(2)}s` : `${(seconds / 60).toFixed(2)}m`
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ts
  }
}

// M07-F04-02: Token 格式化函数
function formatTokenCount(count: number | string | null | undefined): string {
  const value = toTokenNumber(count)
  if (value === null) {
    return t('common.unknown')
  }
  if (value === 0) {
    return '0'
  }
  return value.toLocaleString()
}

// M07-F04-02: 总 Token 计算属性（后端 Long→String，按数值相加，未知侧不补 0）
const totalTokens = computed(() => {
  if (!detail.value) return null
  return sumTokens(detail.value.inputTokens, detail.value.outputTokens)
})

// ─── 折叠状态 ───
const showInputExpanded = ref(true)
const showOutputExpanded = ref(true)

function toggleInputExpand() {
  showInputExpanded.value = !showInputExpanded.value
}

function toggleOutputExpand() {
  showOutputExpanded.value = !showOutputExpanded.value
}

// ─── 数据加载 ───
async function loadDetail() {
  loading.value = true
  error.value = null
  detail.value = null
  nodes.value = []
  humanTasks.value = []
  lifecycleState.value = null

  try {
    // 生命周期执行使用独立持久化端点；旧同步执行继续使用原详情端点。
    try {
      const state = await getGraphExecutionLifecycle(executionId.value)
      lifecycleState.value = state
      const graph = await getGraphDef(state.graphDefId)
      detail.value = {
        id: state.executionId,
        graphDefId: state.graphDefId,
        graphKey: graph.graphKey,
        graphName: graph.name,
        defVersion: state.graphDefVersion,
        graphDefVersion: state.graphDefVersion,
        input: state.input,
        status: state.status,
        output: state.output ?? '',
        success: state.status === 'SUCCESS',
        latencyMs: state.latencyMs ?? 0,
        errorMessage: state.errorMessage,
        errorCategory: state.errorCategory,
        createTime: state.createTime ?? '',
        updateTime: state.finishedAt ?? state.startedAt ?? state.createTime,
        nodeDetails: [],
      }
      // G1-7：异步执行按结果执行 id 回查节点轨迹（此前该路径恒为空）
      if (state.resultExecutionId) {
        try {
          nodes.value = await listExecutionNodes(state.resultExecutionId)
        } catch {
          nodes.value = []
        }
      }
      void loadHumanTasks()
      return
    } catch {
      // 兼容生命周期上线前的同步执行历史。
    }

    const response = await getExecutionDetail(executionId.value)
    detail.value = response
    if (response.nodeDetails && response.nodeDetails.length > 0) {
      nodes.value = response.nodeDetails
    } else {
      nodes.value = await listExecutionNodes(executionId.value)
    }
  } catch (err) {
    if (err instanceof ApiError) {
      // 404: 执行不存在或跨租户
      if (err.code === 404 || err.msg?.includes('404')) {
        router.replace('/404')
        return
      }
      error.value = err.msg || t('agent.executionDetailLoadFailed')
    } else {
      error.value = t('agent.executionDetailLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

// ─── 导航操作 ───
function goBack() {
  const graphDefId = detail.value?.graphDefId
  if (graphDefId) {
    router.push({ name: 'agent-execution-list', query: { graphDefId } })
  } else {
    router.push({ name: 'agent-execution-list' })
  }
}

// ─── 挂载 ───
onMounted(() => {
  if (!executionId.value || !/^\d+$/.test(String(executionId.value))) {
    error.value = t('agent.invalidExecutionId')
  } else {
    void loadDetail()
  }
})
</script>

<template>
  <div class="execution-detail-page">
    <!-- 加载中骨架屏 -->
    <el-skeleton v-if="loading" :rows="8" animated />

    <!-- 错误提示 -->
    <el-alert v-else-if="error" :title="error" type="error" show-icon :closable="false" />

    <!-- 详情内容 -->
    <template v-else-if="detail">
      <!-- 头部：返回按钮 + 基本信息 -->
      <div class="page-header">
        <el-button @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          {{ t('common.backToList') }}
        </el-button>
        <div class="header-info">
          <span class="execution-id">#{{ displayExecutionId }}</span>
          <!-- W5：受理编号（生命周期请求行）仅详情透出，避免两个编号混用 -->
          <span
            v-if="acceptedExecutionId && acceptedExecutionId !== displayExecutionId"
            class="execution-id execution-id--accepted"
          >
            {{ t('agent.acceptedNoLabel') }} #{{ acceptedExecutionId }}
          </span>
          <span class="graph-name">{{ detail.graphName }}</span>
          <span class="divider">·</span>
          <span class="def-version">{{
            t('agent.snapshotVersionLabel', {
              version: detail.graphDefVersion ?? detail.defVersion ?? '-',
            })
          }}</span>
          <el-tag :type="(getStatusType(detail.status) || '') as any" size="small">
            {{ getStatusLabel(detail.status) }}
          </el-tag>
          <span class="latency">{{ formatLatency(detail.latencyMs) }}</span>
        </div>
      </div>

      <!-- 主体内容区 -->
      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">{{ t('agent.inputContent') }}</div>
        </template>
        <div class="content-body">
          <div v-if="showInputExpanded" class="input-display">
            <!-- 使用 Vue 自动转义的安全插值表达式，不使用 v-html -->
            <pre>{{ detail.input }}</pre>
          </div>
          <div v-else class="content-preview">
            {{ detail.input?.substring(0, 200) || t('common.blank') }}
          </div>
          <div class="content-actions">
            <el-button link type="primary" @click="toggleInputExpand">
              {{ showInputExpanded ? t('common.collapse') : t('common.expand') }}
            </el-button>
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">{{ t('agent.outputContent') }}</div>
        </template>
        <div class="content-body">
          <div v-if="showOutputExpanded" class="output-display">
            <!-- 使用 Vue 自动转义的安全插值表达式 -->
            <pre>{{ detail.output }}</pre>
          </div>
          <div v-else class="content-preview">
            {{ detail.output?.substring(0, 200) || t('common.blank') }}
          </div>
          <div class="content-actions">
            <el-button link type="primary" @click="toggleOutputExpand">
              {{ showOutputExpanded ? t('common.collapse') : t('common.expand') }}
            </el-button>
          </div>
        </div>
      </el-card>

      <!-- 错误信息块（仅在失败时展示） -->
      <el-card
        v-if="!detail.success && detail.errorMessage"
        shadow="never"
        class="detail-section error-section"
      >
        <template #header>
          <div class="section-title error-title">{{ t('agent.errorInfoSection') }}</div>
        </template>
        <div class="error-content">
          <div v-if="detail.errorCategory" class="error-category">
            {{ t('agent.failureCategory') }}：{{ detail.errorCategory }}
          </div>
          <!-- 使用 SafeHtml 组件进行安全的 HTML 渲染 -->
          <SafeHtml :html="detail.errorMessage" />
        </div>
      </el-card>

      <!-- 时间信息 -->
      <el-card shadow="never" class="detail-section time-section">
        <template #header>
          <div class="section-title">{{ t('agent.timingInfo') }}</div>
        </template>
        <div class="time-grid">
          <div class="time-item">
            <span class="time-label">{{ t('agent.createTimeLabel') }}</span>
            <span class="time-value">{{ formatTimestamp(detail.createTime) }}</span>
          </div>
          <div class="time-item">
            <span class="time-label">{{ t('agent.updateTimeLabel') }}</span>
            <span class="time-value">{{
              formatTimestamp(detail.updateTime ?? detail.createTime)
            }}</span>
          </div>
          <div v-if="detail.traceId" class="time-item full-width">
            <span class="time-label">{{ t('agent.traceIdLabel') }}</span>
            <span class="time-value monospace">{{ detail.traceId }}</span>
          </div>
        </div>
      </el-card>

      <!-- M07-F04-02: Token 使用统计（D164 标准5：非账单/非完整成本口径说明） -->
      <el-card shadow="never" class="detail-section token-section">
        <template #header>
          <div class="section-title">
            {{ t('agent.tokenUsageStats') }}
            <el-tooltip :content="t('agent.usageObservabilityTooltip')" placement="top">
              <span class="token-disclaimer-detail">{{ t('common.observability') }}</span>
            </el-tooltip>
          </div>
        </template>
        <div class="token-grid">
          <div class="token-item">
            <span class="token-label">{{ t('agent.inputTokensLabel') }}</span>
            <span class="token-value">{{ formatTokenCount(detail.inputTokens) }}</span>
          </div>
          <div class="token-item">
            <span class="token-label">{{ t('agent.outputTokensLabel') }}</span>
            <span class="token-value">{{ formatTokenCount(detail.outputTokens) }}</span>
          </div>
          <div class="token-item">
            <span class="token-label">{{ t('agent.totalTokensLabel') }}</span>
            <span class="token-value">{{ formatTokenCount(totalTokens) }}</span>
          </div>
        </div>
      </el-card>

      <!-- G3：人工任务（等待/已处理） -->
      <el-card v-if="humanTasks.length > 0" shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">{{ t('agent.humanTasksTitle') }}</div>
        </template>
        <div v-for="task in humanTasks" :key="task.id" class="human-task-row">
          <div class="human-task-row__main">
            <div class="human-task-row__title">
              {{ task.nodeId }}
              <el-tag
                size="small"
                :type="task.status === 'PENDING' ? 'warning' : 'info'"
                effect="plain"
              >
                {{ humanTaskStatusLabel(task.status) }}
              </el-tag>
            </div>
            <div v-if="task.instructions" class="human-task-row__instructions">
              {{ task.instructions }}
            </div>
            <div class="human-task-row__meta">
              <span v-if="task.assigneeRoleCode">
                {{ t('agent.humanTaskAssignee') }}：{{ task.assigneeRoleCode }}
              </span>
              <span v-else-if="task.assigneeUserId">
                {{ t('agent.humanTaskAssignee') }}：#{{ task.assigneeUserId }}
              </span>
              <span v-if="task.timeoutSeconds">
                {{ t('agent.humanTaskTimeoutLabel', { seconds: task.timeoutSeconds }) }}
              </span>
              <span>{{ t('agent.humanTaskCreatedAt') }}：{{ task.createTime || '-' }}</span>
            </div>
          </div>
          <el-button
            v-if="task.status === 'PENDING'"
            size="small"
            type="primary"
            @click="openHumanTask(task)"
          >
            {{ t('agent.humanInboxOpen') }}
          </el-button>
        </div>
      </el-card>

      <!-- 节点轨迹子视图 -->
      <el-card shadow="never" class="detail-section trajectory-section">
        <template #header>
          <div class="section-title">{{ t('agent.nodeTrajectory') }}</div>
        </template>
        <div class="trajectory-body">
          <NodeTrajectory
            :nodes="nodes"
            @view-child-execution="(id) => router.push(`/agent/executions/detail/${id}`)"
          />
        </div>
      </el-card>
    </template>

    <!-- 未找到状态 -->
    <el-empty v-else :description="t('agent.noExecutionDetailData')" />

    <HumanTaskSubmitDialog
      v-model="humanDialogVisible"
      :task="activeHumanTask"
      @submitted="handleHumanSubmitted"
    />
  </div>
</template>

<style scoped>
.execution-detail-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--sw-space-24);
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: var(--sw-space-20);
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

/* W5：执行编号主标识 + 受理号次标识 */
.execution-id {
  font-size: 15px;
  font-weight: 600;
  color: var(--sw-text-primary);
  font-family: monospace;
}

.execution-id--accepted {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.graph-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

.divider {
  color: #dcdfe6;
}

.def-version {
  font-size: 13px;
  color: #909399;
}

.latency {
  font-size: 13px;
  color: #606266;
}

.detail-section {
  margin-bottom: var(--sw-space-16);
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

.error-title {
  color: #f56c6c;
}

.content-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-display,
.output-display {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
}

.input-display pre,
.output-display pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
}

.content-preview {
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 6px;
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
}

.content-actions {
  display: flex;
  justify-content: flex-end;
}

.error-section .el-card__body {
  background: #fef0f0;
}

.error-content {
  padding: 16px;
  background: #fff;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}

.time-grid {
  display: grid;
  gap: 12px;
}

.time-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.time-item.full-width {
  grid-column: 1 / -1;
}

.time-label {
  font-size: 13px;
  color: #909399;
  min-width: 80px;
}

.time-value {
  font-size: 13px;
  color: var(--sw-text-primary);
}

.time-value.monospace {
  font-family: 'Courier New', Monaco, monospace;
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
}

.trajectory-body {
  padding: 8px 0;
}

/* M07-F04-02: Token 使用统计样式 */
.token-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.token-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.token-label {
  font-size: 12px;
  color: #909399;
}

.token-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

.token-disclaimer-detail {
  font-size: 11px;
  color: #909399;
  margin-left: 8px;
  border-bottom: 1px dashed #c0c4cc;
  cursor: help;
}

.token-footnote {
  margin-top: 12px;
  font-size: 11px;
  color: #909399;
  line-height: 1.5;
}
.human-task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.human-task-row:last-child {
  border-bottom: none;
}

.human-task-row__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.human-task-row__instructions {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-top: 2px;
}

.human-task-row__meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>

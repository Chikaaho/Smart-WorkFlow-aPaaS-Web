<script setup lang="ts">
/**
 * DebugSessionView — 图单步调试会话页
 *
 * 展示单次调试会话的完整信息：
 * - 头部：状态徽标、graphDefId、defVersion、input 预览
 * - 当前状态卡：nextNodeId、nextBranchId、variables、expiresAt
 * - 控制：单步 / 继续 / 停止（仅 PAUSED 可用），409 版本冲突提示
 * - 断点：nodeIds 列表，checkbox 切换（仅 PAUSED 可操作）
 * - 节点轨迹：复用 NodeTrajectory（AgentGraphDebugNode → AgentGraphExecutionNode 映射）
 * - 错误/结果/耗时与 Token 汇总
 *
 * 数据加载：onMounted 并发拉取 getDebugSession + listDebugNodes，服务端为真源，刷新即重拉，无本地存储。
 * 安全：无 v-html、无 localStorage/sessionStorage 读写，错误消息经 SafeHtml。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getDebugSession,
  listDebugNodes,
  stepDebugSession,
  continueDebugSession,
  stopDebugSession,
  updateDebugBreakpoints,
} from '@/modules/agent/api'
import type {
  AgentGraphDebugSession,
  AgentGraphDebugNode,
  AgentGraphExecutionNode,
} from '@/contracts/agent'
import { ApiError } from '@/foundation/request'
import NodeTrajectory from '@/modules/agent/components/execution/NodeTrajectory.vue'
import SafeHtml from '@/security/SafeHtml.vue'

const route = useRoute()
const router = useRouter()

const sessionId = computed(() => Number(route.params.sessionId))

const loading = ref(false)
const error = ref<string | null>(null)
const session = ref<AgentGraphDebugSession | null>(null)
const nodes = ref<AgentGraphDebugNode[]>([])
const actionLoading = ref<'step' | 'continue' | 'stop' | 'breakpoint' | null>(null)
const versionConflictTip = ref('')

// ─── 状态映射 ───
const STATUS_MAP: Record<
  string,
  { label: string; type: 'success' | 'warning' | 'info' | 'danger' | '' }
> = {
  PAUSED: { label: '已暂停', type: '' },
  COMPLETED: { label: '已完成', type: 'success' },
  FAILED: { label: '失败', type: 'danger' },
  STOPPED: { label: '已停止', type: 'info' },
  EXPIRED: { label: '已过期', type: 'warning' },
}

function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status
}

function getStatusType(status: string): 'success' | 'warning' | 'info' | 'danger' | '' {
  return (STATUS_MAP[status]?.type ?? '') as 'success' | 'warning' | 'info' | 'danger' | ''
}

function getStatusColor(status: string): string {
  // Element Plus tag type maps to color; PAUSED uses primary blue via custom class
  if (status === 'PAUSED') return 'primary'
  return getStatusType(status) as string
}

const isPaused = computed(() => session.value?.status === 'PAUSED')

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString('zh-CN', {
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

function formatLatency(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined) return '-'
  if (latencyMs < 1000) return `${latencyMs}ms`
  const s = latencyMs / 1000
  return s < 60 ? `${s.toFixed(2)}s` : `${(s / 60).toFixed(2)}m`
}

function formatTokenCount(count: number | null | undefined): string {
  if (count === null || count === undefined) return '未知'
  if (count === 0) return '0'
  return count.toLocaleString()
}

const totalTokens = computed(() => {
  if (!session.value) return null
  const i = session.value.inputTokens
  const o = session.value.outputTokens
  if (i === null || i === undefined || o === null || o === undefined) return null
  return i + o
})

// variables 展示：JSON 美化，失败回落原文
const variablesPreview = computed(() => {
  if (!session.value?.variables) return '(空)'
  try {
    const v = session.value.variables
    if (typeof v === 'string') {
      try {
        return JSON.stringify(JSON.parse(v as unknown as string), null, 2)
      } catch {
        return v as unknown as string
      }
    }
    return JSON.stringify(v, null, 2)
  } catch {
    return String(session.value.variables)
  }
})

// ─── NodeTrajectory 映射：AgentGraphDebugNode → AgentGraphExecutionNode ───
const trajectoryNodes = computed<AgentGraphExecutionNode[]>(() => {
  return [...nodes.value]
    .sort((a, b) => a.nodeSeq - b.nodeSeq)
    .map((n) => ({
      nodeSeq: n.nodeSeq,
      branchId: n.branchId,
      nodeId: n.nodeId,
      nodeType: n.nodeType,
      nodeName: n.nodeId,
      status: 'SUCCESS',
      input: n.variableSnapshot ?? undefined,
      output: undefined,
      success: true,
      nodeLatencyMs: n.nodeLatencyMs,
      inputTokens: n.inputTokens ?? null,
      outputTokens: n.outputTokens ?? null,
      startTime: undefined,
      endTime: undefined,
      errorMessage: undefined,
      buildTime: '',
    }))
})

// ─── 断点候选：已执行节点去重 + 已设断点去重 ───
const breakpointCandidates = computed<string[]>(() => {
  const set = new Set<string>()
  for (const n of nodes.value) set.add(n.nodeId)
  for (const b of session.value?.breakpoints ?? []) set.add(b)
  return Array.from(set).sort()
})

const newBreakpointInput = ref('')

function isBreakpointChecked(nodeId: string): boolean {
  return session.value?.breakpoints?.includes(nodeId) ?? false
}

// ─── 数据加载 ───
async function loadSession() {
  loading.value = true
  error.value = null
  versionConflictTip.value = ''
  try {
    const [s, ns] = await Promise.all([
      getDebugSession(sessionId.value),
      listDebugNodes(sessionId.value),
    ])
    session.value = s
    nodes.value = ns
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 404 || err.msg?.includes('404')) {
        router.replace('/404')
        return
      }
      error.value = err.msg || '加载调试会话失败'
    } else {
      error.value = '加载调试会话失败'
    }
  } finally {
    loading.value = false
  }
}

async function reloadAfterAction() {
  try {
    const [s, ns] = await Promise.all([
      getDebugSession(sessionId.value),
      listDebugNodes(sessionId.value),
    ])
    session.value = s
    nodes.value = ns
  } catch (err) {
    if (err instanceof ApiError) error.value = err.msg
  }
}

// ─── 控制操作 ───
async function handleStep() {
  if (!session.value || !isPaused.value) return
  actionLoading.value = 'step'
  versionConflictTip.value = ''
  try {
    await stepDebugSession(sessionId.value, session.value.version)
    await reloadAfterAction()
  } catch (err) {
    if (err instanceof ApiError && err.code === 409) {
      versionConflictTip.value = '版本冲突：会话已被其他操作更新，已自动刷新，请重试。'
      await reloadAfterAction()
    } else if (err instanceof ApiError) {
      ElMessage.error(err.msg || '单步执行失败')
      await reloadAfterAction()
    } else {
      ElMessage.error('单步执行失败')
    }
  } finally {
    actionLoading.value = null
  }
}

async function handleContinue() {
  if (!isPaused.value) return
  actionLoading.value = 'continue'
  versionConflictTip.value = ''
  try {
    await continueDebugSession(sessionId.value)
    await reloadAfterAction()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg || '继续执行失败')
    else ElMessage.error('继续执行失败')
    await reloadAfterAction()
  } finally {
    actionLoading.value = null
  }
}

async function handleStop() {
  if (!isPaused.value) return
  actionLoading.value = 'stop'
  versionConflictTip.value = ''
  try {
    await stopDebugSession(sessionId.value)
    await reloadAfterAction()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg || '停止失败')
    else ElMessage.error('停止失败')
    await reloadAfterAction()
  } finally {
    actionLoading.value = null
  }
}

async function handleBreakpointToggle(nodeId: string) {
  if (!session.value || !isPaused.value) return
  const current = new Set(session.value.breakpoints ?? [])
  if (current.has(nodeId)) current.delete(nodeId)
  else current.add(nodeId)
  const next = Array.from(current)
  actionLoading.value = 'breakpoint'
  try {
    const updated = await updateDebugBreakpoints(sessionId.value, next)
    session.value = updated
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg || '更新断点失败')
    else ElMessage.error('更新断点失败')
  } finally {
    actionLoading.value = null
  }
}

async function handleAddBreakpoint() {
  const v = newBreakpointInput.value.trim()
  if (!v) {
    ElMessage.warning('请输入节点 ID')
    return
  }
  if (!session.value || !isPaused.value) return
  const current = new Set(session.value.breakpoints ?? [])
  if (current.has(v)) {
    ElMessage.warning('该断点已存在')
    return
  }
  current.add(v)
  actionLoading.value = 'breakpoint'
  try {
    const updated = await updateDebugBreakpoints(sessionId.value, Array.from(current))
    session.value = updated
    newBreakpointInput.value = ''
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg || '添加断点失败')
    else ElMessage.error('添加断点失败')
  } finally {
    actionLoading.value = null
  }
}

function goBack() {
  router.push('/agent/graph-def')
}

onMounted(() => {
  if (!sessionId.value || isNaN(sessionId.value)) {
    error.value = '无效的调试会话 ID'
  } else {
    void loadSession()
  }
})
</script>

<template>
  <div class="debug-session-page">
    <el-skeleton v-if="loading" :rows="8" animated />

    <el-alert v-else-if="error" :title="error" type="error" show-icon :closable="false" />

    <template v-else-if="session">
      <!-- 头部 -->
      <div class="page-header">
        <el-button @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <div class="header-info">
          <span class="session-id">#{{ session.id }}</span>
          <el-tag
            :type="getStatusColor(session.status) as any"
            size="small"
            :class="{ 'tag-paused': session.status === 'PAUSED' }"
          >
            {{ getStatusLabel(session.status) }}
          </el-tag>
          <span class="graph-meta">图 #{{ session.graphDefId }}</span>
          <span class="divider">·</span>
          <span class="def-version">版本 v{{ session.graphDefVersion }}</span>
          <span class="trace-count">trace {{ session.traceCount }}</span>
          <span class="latency">{{ formatLatency(session.latencyMs) }}</span>
        </div>
      </div>

      <!-- 输入预览 -->
      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">输入预览</div>
        </template>
        <div class="content-preview-box">
          <pre>{{ session.input }}</pre>
        </div>
      </el-card>

      <!-- 当前状态卡 -->
      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">当前状态</div>
        </template>
        <div class="state-grid">
          <div class="state-item">
            <span class="state-label">下一节点:</span>
            <span class="state-value monospace">{{ session.nextNodeId ?? '-' }}</span>
          </div>
          <div class="state-item">
            <span class="state-label">分支:</span>
            <span class="state-value monospace">{{ session.nextBranchId ?? '-' }}</span>
          </div>
          <div class="state-item">
            <span class="state-label">过期时间:</span>
            <span class="state-value">{{ formatTimestamp(session.expiresAt) }}</span>
          </div>
          <div class="state-item full-width">
            <span class="state-label">变量:</span>
            <div class="variables-preview">
              <pre>{{ variablesPreview }}</pre>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 控制区 -->
      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">调试控制</div>
        </template>
        <div class="controls">
          <el-button
            type="primary"
            :disabled="!isPaused"
            :loading="actionLoading === 'step'"
            @click="handleStep"
          >
            单步
          </el-button>
          <el-button
            type="success"
            :disabled="!isPaused"
            :loading="actionLoading === 'continue'"
            @click="handleContinue"
          >
            继续
          </el-button>
          <el-button
            type="danger"
            :disabled="!isPaused"
            :loading="actionLoading === 'stop'"
            @click="handleStop"
          >
            停止
          </el-button>
          <span v-if="!isPaused" class="controls-hint">仅 PAUSED 状态可操作</span>
        </div>
        <el-alert
          v-if="versionConflictTip"
          :title="versionConflictTip"
          type="warning"
          show-icon
          :closable="false"
          style="margin-top: 12px"
        />
      </el-card>

      <!-- 断点 -->
      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">断点</div>
        </template>
        <div
          v-if="breakpointCandidates.length === 0 && (session.breakpoints?.length ?? 0) === 0"
          class="empty-tip"
        >
          暂无断点候选（执行节点为空）
        </div>
        <div v-else class="breakpoints-list">
          <label
            v-for="nodeId in breakpointCandidates"
            :key="nodeId"
            class="breakpoint-item"
            :class="{ disabled: !isPaused }"
          >
            <el-checkbox
              :model-value="isBreakpointChecked(nodeId)"
              :disabled="!isPaused || actionLoading === 'breakpoint'"
              @change="() => handleBreakpointToggle(nodeId)"
            />
            <span class="breakpoint-label monospace">{{ nodeId }}</span>
          </label>
        </div>
        <div class="breakpoint-add">
          <el-input
            v-model="newBreakpointInput"
            placeholder="输入节点 ID 添加断点"
            size="small"
            style="width: 240px"
            :disabled="!isPaused"
            @keyup.enter="handleAddBreakpoint"
          />
          <el-button
            size="small"
            type="primary"
            :disabled="!isPaused || actionLoading === 'breakpoint'"
            @click="handleAddBreakpoint"
            >添加</el-button
          >
        </div>
      </el-card>

      <!-- 错误展示（FAILED） -->
      <el-card
        v-if="session.status === 'FAILED'"
        shadow="never"
        class="detail-section error-section"
      >
        <template #header>
          <div class="section-title error-title">错误信息</div>
        </template>
        <div class="error-content">
          <div v-if="session.errorCategory" class="error-category">
            分类：{{ session.errorCategory }}
          </div>
          <SafeHtml v-if="session.errorMessage" :html="session.errorMessage" />
          <span v-else class="text-muted">无详细错误</span>
        </div>
      </el-card>

      <!-- 结果展示（COMPLETED） -->
      <el-card v-if="session.status === 'COMPLETED'" shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">执行结果</div>
        </template>
        <div class="content-preview-box">
          <pre>{{ session.resultText ?? '(空)' }}</pre>
        </div>
      </el-card>

      <!-- 耗时与 Token 汇总 -->
      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">耗时与 Token</div>
        </template>
        <div class="token-grid">
          <div class="token-item">
            <span class="token-label">耗时</span>
            <span class="token-value">{{ formatLatency(session.latencyMs) }}</span>
          </div>
          <div class="token-item">
            <span class="token-label">输入 Token</span>
            <span class="token-value">{{ formatTokenCount(session.inputTokens) }}</span>
          </div>
          <div class="token-item">
            <span class="token-label">输出 Token</span>
            <span class="token-value">{{ formatTokenCount(session.outputTokens) }}</span>
          </div>
          <div class="token-item">
            <span class="token-label">总 Token</span>
            <span class="token-value">{{ formatTokenCount(totalTokens) }}</span>
          </div>
        </div>
      </el-card>

      <!-- 节点轨迹 -->
      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">节点轨迹</div>
        </template>
        <NodeTrajectory :nodes="trajectoryNodes" />
      </el-card>
    </template>

    <el-empty v-else description="暂无调试会话数据" />
  </div>
</template>

<style scoped>
.debug-session-page {
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
  flex-wrap: wrap;
}

.session-id {
  font-weight: 600;
  color: var(--sw-text-primary);
}

.graph-meta {
  font-size: 13px;
  color: #606266;
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

.tag-paused {
  --el-tag-bg-color: #ecf5ff;
  --el-tag-text-color: #409eff;
  --el-tag-border-color: #d9ecff;
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

.content-preview-box {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
}

.content-preview-box pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
}

.state-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.state-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-item.full-width {
  grid-column: 1 / -1;
}

.state-label {
  font-size: 12px;
  color: #909399;
}

.state-value {
  font-size: 13px;
  color: var(--sw-text-primary);
}

.state-value.monospace {
  font-family: 'Courier New', Monaco, monospace;
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
}

.variables-preview {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
}

.variables-preview pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
  color: #303133;
  max-height: 300px;
  overflow-y: auto;
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.controls-hint {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
}

.breakpoints-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.breakpoint-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
}

.breakpoint-item.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.breakpoint-label {
  font-size: 13px;
}

.breakpoint-label.monospace {
  font-family: 'Courier New', Monaco, monospace;
}

.breakpoint-add {
  display: flex;
  gap: 8px;
  align-items: center;
}

.empty-tip {
  color: #909399;
  font-size: 13px;
  font-style: italic;
  margin-bottom: 12px;
}

.monospace {
  font-family: 'Courier New', Monaco, monospace;
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

.error-category {
  font-family: 'Courier New', Monaco, monospace;
  font-size: 12px;
  color: #e6a23c;
  background: #fdf6ec;
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
  margin-bottom: 8px;
}

.text-muted {
  color: #c0c4cc;
  font-size: 12px;
}

.token-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
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
</style>

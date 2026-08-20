<script setup lang="ts">
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
import { getExecutionDetail, listExecutionNodes } from '@/modules/agent/api'
import type { AgentGraphExecutionDetail, AgentGraphExecutionNode } from '@/contracts/agent'
import { ApiError } from '@/foundation/request'
import NodeTrajectory from '@/modules/agent/components/execution/NodeTrajectory.vue'
import SafeHtml from '@/security/SafeHtml.vue'

const route = useRoute()
const router = useRouter()

// ─── 路由参数 ───
const executionId = computed(() => Number(route.params.executionId))

// ─── 状态变量 ───
const loading = ref(false)
const error = ref<string | null>(null)
const detail = ref<AgentGraphExecutionDetail | null>(null)
const nodes = ref<AgentGraphExecutionNode[]>([])

// ─── 状态映射 ───
const STATUS_MAP: Record<
  string,
  { label: string; type: 'success' | 'warning' | 'info' | 'danger' | '' }
> = {
  RUNNING: { label: '运行中', type: 'warning' },
  SUCCESS: { label: '成功', type: 'success' },
  FAILED: { label: '失败', type: 'danger' },
}

function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status
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

  try {
    // 1. 优先拉取完整详情
    const response = await getExecutionDetail(executionId.value)
    detail.value = response

    // 2. 若响应含 nodeDetails，直接使用
    if (response.nodeDetails && response.nodeDetails.length > 0) {
      nodes.value = response.nodeDetails
    } else {
      // 3. 否则单独拉取节点列表
      nodes.value = await listExecutionNodes(executionId.value)
    }
  } catch (err) {
    if (err instanceof ApiError) {
      // 404: 执行不存在或跨租户
      if (err.code === 404 || err.msg?.includes('404')) {
        router.replace('/404')
        return
      }
      error.value = err.msg || '加载执行详情失败'
    } else {
      error.value = '加载执行详情失败'
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
  if (!executionId.value || isNaN(executionId.value)) {
    error.value = '无效的执行 ID'
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
          返回列表
        </el-button>
        <div class="header-info">
          <span class="execution-id">#{{ executionId }}</span>
          <span class="graph-name">{{ detail.graphName }}</span>
          <span class="divider">·</span>
          <span class="def-version">版本 v{{ detail.defVersion ?? '-' }}</span>
          <el-tag :type="(getStatusType(detail.status) || '') as any" size="small">
            {{ getStatusLabel(detail.status) }}
          </el-tag>
          <span class="latency">{{ formatLatency(detail.latencyMs) }}</span>
        </div>
      </div>

      <!-- 主体内容区 -->
      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">输入内容</div>
        </template>
        <div class="content-body">
          <div v-if="showInputExpanded" class="input-display">
            <!-- 使用 Vue 自动转义的安全插值表达式，不使用 v-html -->
            <pre>{{ detail.input }}</pre>
          </div>
          <div v-else class="content-preview">
            {{ detail.input?.substring(0, 200) || '(空)' }}
          </div>
          <div class="content-actions">
            <el-button link type="primary" @click="toggleInputExpand">
              {{ showInputExpanded ? '收起' : '展开' }}
            </el-button>
          </div>
        </div>
      </el-card>

      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="section-title">输出内容</div>
        </template>
        <div class="content-body">
          <div v-if="showOutputExpanded" class="output-display">
            <!-- 使用 Vue 自动转义的安全插值表达式 -->
            <pre>{{ detail.output }}</pre>
          </div>
          <div v-else class="content-preview">
            {{ detail.output?.substring(0, 200) || '(空)' }}
          </div>
          <div class="content-actions">
            <el-button link type="primary" @click="toggleOutputExpand">
              {{ showOutputExpanded ? '收起' : '展开' }}
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
          <div class="section-title error-title">错误信息</div>
        </template>
        <div class="error-content">
          <!-- 使用 SafeHtml 组件进行安全的 HTML 渲染 -->
          <SafeHtml :html="detail.errorMessage" />
        </div>
      </el-card>

      <!-- 时间信息 -->
      <el-card shadow="never" class="detail-section time-section">
        <template #header>
          <div class="section-title">时间信息</div>
        </template>
        <div class="time-grid">
          <div class="time-item">
            <span class="time-label">创建时间:</span>
            <span class="time-value">{{ formatTimestamp(detail.createTime) }}</span>
          </div>
          <div class="time-item">
            <span class="time-label">更新时间:</span>
            <span class="time-value">{{
              formatTimestamp(detail.updateTime ?? detail.createTime)
            }}</span>
          </div>
          <div v-if="detail.traceId" class="time-item full-width">
            <span class="time-label">追踪 ID:</span>
            <span class="time-value monospace">{{ detail.traceId }}</span>
          </div>
        </div>
      </el-card>

      <!-- 节点轨迹子视图 -->
      <el-card shadow="never" class="detail-section trajectory-section">
        <template #header>
          <div class="section-title">节点轨迹</div>
        </template>
        <div class="trajectory-body">
          <NodeTrajectory :nodes="nodes" />
        </div>
      </el-card>
    </template>

    <!-- 未找到状态 -->
    <el-empty v-else description="暂无执行详情数据" />
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
</style>

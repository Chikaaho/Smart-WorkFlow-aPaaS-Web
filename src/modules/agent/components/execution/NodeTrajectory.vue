<script setup lang="ts">
/**
 * NodeTrajectory — 节点轨迹子视图
 *
 * 按 nodeSeq 升序展示节点执行顺序，保留后端返回的真实 branchId 标识并行分支，
 * 显示节点类型、耗时、状态图标，支持点击展开变量快照。
 *
 * 验收标准 (D126 §6):
 * - 严格按 nodeSeq 呈现
 * - branchId 完全由后端提供，前端不做合成或推断
 * - FORK/JOIN/LOOP 的重复节点或分支不得被前端错误合并
 * - 安全文本或安全 JSON 展示；无 v-html，无 URL 泄漏
 */
import { computed } from 'vue'
import type { AgentGraphExecutionNode } from '@/contracts/agent'

const props = defineProps<{
  nodes: AgentGraphExecutionNode[]
}>()

const emits = defineEmits<{
  nodeClick: [node: AgentGraphExecutionNode]
}>()

/** 状态映射 */
const STATUS_MAP: Record<
  string,
  { label: string; type: 'success' | 'warning' | 'info' | 'danger' | '' }
> = {
  PENDING: { label: '等待中', type: 'info' },
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

/** 格式化耗时 (毫秒 -> 人类可读) */
function formatLatency(latencyMs: number): string {
  if (latencyMs < 1000) {
    return `${latencyMs}ms`
  }
  const seconds = latencyMs / 1000
  return seconds < 60 ? `${seconds.toFixed(2)}s` : `${(seconds / 60).toFixed(2)}m`
}

// M07-F04-02: Token 格式化函数
function formatTokenCount(count: number | null | undefined): string {
  if (count === null || count === undefined) {
    return '未知'
  }
  if (count === 0) {
    return '0'
  }
  return count.toLocaleString()
}

/**
 * 格式化时间字符串 (去掉毫秒部分，便于对比)
 * ISO8601 -> YYYY-MM-DD HH:mm:ss
 */
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

/**
 * 尝试解析为 JSON 对象（用于变量快照的富文本展示）
 * 若解析失败则返回原字符串
 */
function parseJsonSafe(value?: string): unknown {
  if (!value || value.trim() === '') {
    return undefined
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * 检查值是否为纯字符串（非 JSON 对象）
 */
function isPureString(value?: string): boolean {
  if (value === undefined || value === null) return false
  try {
    const parsed = JSON.parse(value)
    return typeof parsed !== 'object' || parsed === null
  } catch {
    // 解析失败说明不是有效 JSON，视为纯文本
    return true
  }
}

/**
 * 对节点数据进行处理：仅按 nodeSeq 升序排序，保留后端返回的真实 branchId。
 * 不合成、不推断 branchId —— 分支标识完全由后端决定。
 */
const processedNodes = computed(() => {
  // 深拷贝避免修改原始数据，仅做排序
  return [...props.nodes].sort((a, b) => a.nodeSeq - b.nodeSeq)
})

/** 当前选中的节点（用于展开变量快照） */
const selectedNode = computed({
  get: () => {
    return currentExpanded.value
  },
  set: (node: AgentGraphExecutionNode | null) => {
    currentExpanded.value = node
  },
})

/** 当前展开的节点 ID */
const currentExpanded = defineModel<AgentGraphExecutionNode | null>('expandedNode')

/** 计算输入/输出的显示内容 */
function getInputDisplay(node: AgentGraphExecutionNode): unknown {
  return parseJsonSafe(node.input)
}

function getOutputDisplay(node: AgentGraphExecutionNode): unknown {
  return parseJsonSafe(node.output)
}

/** 处理节点点击 */
function handleNodeClick(node: AgentGraphExecutionNode) {
  currentExpanded.value = selectedNode.value?.nodeId === node.nodeId ? null : node
  emits('nodeClick', node)
}
</script>

<template>
  <div class="node-trajectory-container">
    <!-- 节点列表 -->
    <div class="node-list">
      <div
        v-for="node in processedNodes"
        :key="node.nodeId"
        class="node-item"
        :class="{
          expanded: selectedNode?.nodeId === node.nodeId,
          'status-success': getStatusType(node.status) === 'success',
          'status-warning': getStatusType(node.status) === 'warning',
          'status-danger': getStatusType(node.status) === 'danger',
        }"
        @click="handleNodeClick(node)"
      >
        <!-- 分支标识 -->
        <div class="node-branch-label">{{ node.branchId }}</div>

        <!-- 节点内容 -->
        <div class="node-content">
          <!-- 序号 + 名称 -->
          <div class="node-header">
            <span class="node-seq">#{{ node.nodeSeq }}</span>
            <span class="node-name">{{ node.nodeName }}</span>
          </div>

          <!-- 节点元信息 -->
          <div class="node-meta">
            <el-tag size="small" :type="getStatusType(node.nodeType) || undefined" effect="plain">
              {{ node.nodeType }}
            </el-tag>
            <el-tag size="small" :type="getStatusType(node.status) || undefined" effect="plain">
              {{ getStatusLabel(node.status) }}
            </el-tag>
            <span class="node-latency">{{ formatLatency(node.nodeLatencyMs) }}</span>
            <!-- M07-F04-02: Token 使用信息（仅 LLM 节点显示；null=未知，明确展示而非隐藏） -->
            <span v-if="node.nodeType === 'LLM'" class="node-token">
              输入: {{ formatTokenCount(node.inputTokens) }}
            </span>
            <span v-if="node.nodeType === 'LLM'" class="node-token">
              输出: {{ formatTokenCount(node.outputTokens) }}
            </span>
          </div>

          <!-- 展开区域：变量快照 -->
          <div v-if="selectedNode?.nodeId === node.nodeId" class="node-details">
            <div class="detail-section">
              <div class="detail-title">输入变量 (Input)</div>
              <div class="detail-content">
                <div v-if="!isPureString(node.input)">
                  <pre class="json-preview">{{
                    JSON.stringify(getInputDisplay(node), null, 2)
                  }}</pre>
                </div>
                <div v-else-if="node.input" class="text-preview">{{ node.input }}</div>
                <div v-else class="empty-tip">无</div>
              </div>
            </div>

            <div class="detail-section">
              <div class="detail-title">输出结果 (Output)</div>
              <div class="detail-content">
                <div v-if="!isPureString(node.output)">
                  <pre class="json-preview">{{
                    JSON.stringify(getOutputDisplay(node), null, 2)
                  }}</pre>
                </div>
                <div v-else-if="node.output" class="text-preview">{{ node.output }}</div>
                <div v-else class="empty-tip">无</div>
              </div>
            </div>

            <div v-if="node.errorMessage" class="detail-section error-section">
              <div class="detail-title">错误信息 (Error Message)</div>
              <div class="detail-content text-preview">{{ node.errorMessage }}</div>
            </div>

            <div class="detail-section times-section">
              <div class="detail-title">时间信息</div>
              <div class="time-row">
                <span class="label">开始时间:</span>
                <span class="value">{{ formatTimestamp(node.startTime || '-') }}</span>
              </div>
              <div class="time-row">
                <span class="label">结束时间:</span>
                <span class="value">{{ formatTimestamp(node.endTime || '-') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-if="processedNodes.length === 0" description="暂无节点执行记录" />
  </div>
</template>

<style scoped>
.node-trajectory-container {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.node-item {
  display: flex;
  align-items: flex-start;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

.node-item:hover {
  border-color: #409eff;
  background: #f5f7fa;
}

.node-item.expanded {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}

/* 状态样式覆盖 */
.node-item.status-success {
  border-left: 3px solid #67c23a;
}

.node-item.status-warning {
  border-left: 3px solid #e6a23c;
}

.node-item.status-danger {
  border-left: 3px solid #f56c6c;
}

.node-branch-label {
  padding: 8px 12px;
  font-size: 12px;
  color: #909399;
  background: #fafafa;
  min-width: 70px;
  text-align: center;
  border-right: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-content {
  flex: 1;
  padding: 12px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.node-seq {
  font-size: 12px;
  font-weight: 600;
  color: #c0c4cc;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
}

.node-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

.node-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.node-latency {
  font-size: 12px;
  color: #909399;
}

/* M07-F04-02: Token 样式 */
.node-token {
  font-size: 11px;
  color: #67c23a;
  background: #f0f9eb;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 4px;
}

.node-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e4e7ed;
  display: grid;
  gap: 12px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-title {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  padding-bottom: 4px;
  border-bottom: 1px solid #ebeef5;
}

.detail-content {
  font-size: 13px;
  line-height: 1.6;
}

.json-preview {
  margin: 0;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
  color: #303133;
  font-family: 'Courier New', Monaco, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

.text-preview {
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
  color: #303133;
  word-break: break-word;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

.empty-tip {
  padding: 10px;
  color: #909399;
  font-style: italic;
}

.error-section {
  margin-top: 8px;
}

.error-section .detail-title {
  color: #f56c6c;
  border-color: #fef0f0;
}

.times-section {
  grid-column: 1 / -1;
}

.time-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  font-size: 12px;
  padding: 4px 0;
}

.time-row .label {
  color: #909399;
}

.time-row .value {
  color: var(--sw-text-primary);
  font-family: 'Courier New', Monaco, monospace;
}
</style>

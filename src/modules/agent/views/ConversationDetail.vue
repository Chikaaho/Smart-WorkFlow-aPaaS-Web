<script setup lang="ts">
/**
 * ConversationDetail — 会话消息详情页
 *
 * M07-F04-02: 最小生产可达入口，展示会话消息列表及 Token 使用情况
 * 支持查看每条消息的输入/输出 Token
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listConversationMessages } from '@/modules/agent/api'
import type { AgentConversationMessage } from '@/contracts/agent'
import { ApiError } from '@/foundation/request'

const route = useRoute()
const router = useRouter()

// ─── 路由参数 ───
const sessionId = computed(() => Number(route.params.sessionId))

// ─── 状态变量 ───
const loading = ref(false)
const error = ref<string | null>(null)
const messages = ref<AgentConversationMessage[]>([])

// ─── Token 统计 ───
const tokenSummary = computed(() => {
  let totalInput = 0
  let totalOutput = 0
  let hasInputData = false
  let hasOutputData = false

  for (const msg of messages.value) {
    if (msg.inputTokens !== null && msg.inputTokens !== undefined) {
      totalInput += msg.inputTokens
      hasInputData = true
    }
    if (msg.outputTokens !== null && msg.outputTokens !== undefined) {
      totalOutput += msg.outputTokens
      hasOutputData = true
    }
  }

  return {
    totalInput: hasInputData ? totalInput : null,
    totalOutput: hasOutputData ? totalOutput : null,
    totalTokens: hasInputData && hasOutputData ? totalInput + totalOutput : null,
  }
})

// ─── 格式化函数 ───
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

function formatTokenCount(count: number | null | undefined): string {
  if (count === null || count === undefined) {
    return '未知'
  }
  if (count === 0) {
    return '0'
  }
  return count.toLocaleString()
}

// ─── 数据加载 ───
async function loadMessages() {
  loading.value = true
  error.value = null

  try {
    messages.value = await listConversationMessages(sessionId.value)
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 404 || err.msg?.includes('404')) {
        router.replace('/404')
        return
      }
      error.value = err.msg || '加载会话消息失败'
    } else {
      error.value = '加载会话消息失败'
    }
  } finally {
    loading.value = false
  }
}

// ─── 导航操作 ───
function goBack() {
  router.push({ name: 'agent-conversation-list' })
}

// ─── 挂载 ───
onMounted(() => {
  if (!sessionId.value || isNaN(sessionId.value)) {
    error.value = '无效的会话 ID'
  } else {
    void loadMessages()
  }
})
</script>

<template>
  <div class="conversation-detail-page">
    <!-- 头部：返回按钮 + 会话信息 -->
    <div class="page-header">
      <el-button @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        返回列表
      </el-button>
      <div class="header-info">
        <span class="session-id">#{{ sessionId }}</span>
        <span class="page-title">会话消息</span>
      </div>
    </div>

    <!-- Token 使用统计（D164 标准5：非账单/非完整成本口径说明） -->
    <el-card v-if="!loading && !error" shadow="never" class="token-summary-card">
      <template #header>
        <div class="section-title">
          Token 使用统计
          <el-tooltip
            content="供应商可观测 usage（输入/输出/总计），非账单、非完整失败尝试成本"
            placement="top"
          >
            <span class="token-disclaimer-detail">可观测量</span>
          </el-tooltip>
        </div>
      </template>
      <div class="token-grid">
        <div class="token-item">
          <span class="token-label">输入 Token:</span>
          <span class="token-value">{{ formatTokenCount(tokenSummary.totalInput) }}</span>
        </div>
        <div class="token-item">
          <span class="token-label">输出 Token:</span>
          <span class="token-value">{{ formatTokenCount(tokenSummary.totalOutput) }}</span>
        </div>
        <div class="token-item">
          <span class="token-label">总 Token:</span>
          <span class="token-value">{{ formatTokenCount(tokenSummary.totalTokens) }}</span>
        </div>
      </div>
      <div class="token-footnote">
        数据来自模型供应商响应中的 usage，仅为本次会话可观测到的用量，非账单依据。
      </div>
    </el-card>

    <!-- 加载中骨架屏 -->
    <el-skeleton v-if="loading" :rows="5" animated />

    <!-- 错误提示 -->
    <el-alert v-else-if="error" :title="error" type="error" show-icon :closable="false" />

    <!-- 消息列表 -->
    <div v-else-if="messages.length > 0" class="message-list">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-item"
        :class="{
          'message-user': msg.role === 'USER',
          'message-assistant': msg.role === 'ASSISTANT',
        }"
      >
        <div class="message-header">
          <span class="message-role">{{ msg.role === 'USER' ? '用户' : '助手' }}</span>
          <span class="message-order">第 {{ msg.msgOrder + 1 }} 轮</span>
          <span class="message-time">{{ formatTimestamp(msg.createTime) }}</span>
        </div>
        <div class="message-content">{{ msg.content }}</div>
        <div v-if="msg.role === 'ASSISTANT'" class="message-tokens">
          <span class="token-tag"> 输入: {{ formatTokenCount(msg.inputTokens) }} </span>
          <span class="token-tag"> 输出: {{ formatTokenCount(msg.outputTokens) }} </span>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-else description="暂无消息记录" />
  </div>
</template>

<style scoped>
.conversation-detail-page {
  max-width: 800px;
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

.session-id {
  font-size: 14px;
  color: #909399;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--sw-text-primary);
  margin: 0;
}

.token-summary-card {
  margin-bottom: var(--sw-space-16);
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

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

.message-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.message-user {
  background: #f5f7fa;
  border-left: 3px solid #409eff;
}

.message-assistant {
  background: #fff;
  border-left: 3px solid #67c23a;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.message-role {
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

.message-order {
  font-size: 12px;
  color: #909399;
}

.message-time {
  font-size: 12px;
  color: #c0c4cc;
  margin-left: auto;
}

.message-content {
  font-size: 14px;
  line-height: 1.6;
  color: #303133;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-tokens {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e4e7ed;
}

.token-tag {
  font-size: 11px;
  color: #67c23a;
  background: #f0f9eb;
  padding: 2px 6px;
  border-radius: 4px;
}
</style>

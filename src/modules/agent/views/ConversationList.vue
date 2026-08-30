<script setup lang="ts">
/**
 * ConversationList — 会话历史列表页
 *
 * M07-F04-02: 最小生产可达入口，展示当前用户的会话列表
 * 点击会话可查看会话消息及 Token 使用情况
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { listConversations } from '@/modules/agent/api'
import type { AgentConversation } from '@/contracts/agent'
import { ApiError } from '@/foundation/request'

const router = useRouter()

// ─── 状态变量 ───
const loading = ref(false)
const error = ref<string | null>(null)
const conversations = ref<AgentConversation[]>([])

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

// ─── 数据加载 ───
async function loadConversations() {
  loading.value = true
  error.value = null

  try {
    conversations.value = await listConversations()
  } catch (err) {
    if (err instanceof ApiError) {
      error.value = err.msg || '加载会话列表失败'
    } else {
      error.value = '加载会话列表失败'
    }
  } finally {
    loading.value = false
  }
}

// ─── 导航操作 ───
function viewConversation(sessionId: number) {
  router.push({ name: 'agent-conversation-detail', params: { sessionId } })
}

// ─── 挂载 ───
onMounted(() => {
  void loadConversations()
})
</script>

<template>
  <div class="conversation-list-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">会话历史</h2>
    </div>

    <!-- 加载中骨架屏 -->
    <el-skeleton v-if="loading" :rows="5" animated />

    <!-- 错误提示 -->
    <el-alert v-else-if="error" :title="error" type="error" show-icon :closable="false" />

    <!-- 会话列表 -->
    <el-table v-else-if="conversations.length > 0" :data="conversations" stripe>
      <el-table-column prop="id" label="会话 ID" width="100" />
      <el-table-column prop="title" label="标题">
        <template #default="{ row }">
          {{ row.title || '(未命名会话)' }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" type="success">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createTime" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatTimestamp(row.createTime) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="viewConversation(row.id)"> 查看消息 </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空状态 -->
    <el-empty v-else description="暂无会话记录" />
  </div>
</template>

<style scoped>
.conversation-list-page {
  padding: var(--sw-space-24);
}

.page-header {
  margin-bottom: var(--sw-space-20);
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--sw-text-primary);
  margin: 0;
}
</style>

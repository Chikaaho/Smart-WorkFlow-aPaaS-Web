<script setup lang="ts">
/**
 * NotifyInboxMobile — 移动 H5 收件箱（I6）。
 * 与 PC 收件箱读取同一消息、同一已读状态与同一对象权限（方向 §3.7）。
 * 375px 视口单列满宽；支持分页加载、单条已读、全部已读与受保护深链。
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  pageNotifyInbox,
  unreadNotifyCount,
  readAllNotify,
  markAsRead,
  openNotifyLink,
} from '@/modules/notify/api'
import type { NotifyMessage } from '@/contracts/notify'
import { ApiError } from '@/foundation/request'

const router = useRouter()

const list = ref<NotifyMessage[]>([])
const total = ref(0)
const unreadCount = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const pageNum = ref(1)
const pageSize = 10

async function loadList(reset = false) {
  loading.value = true
  errorMsg.value = ''
  try {
    const result = await pageNotifyInbox({ pageNum: pageNum.value, pageSize }, {})
    list.value = reset ? result.list : [...list.value, ...result.list]
    total.value = result.total
    try {
      unreadCount.value = await unreadNotifyCount()
    } catch {
      unreadCount.value = 0
    }
  } catch (err) {
    if (err instanceof ApiError) errorMsg.value = err.msg
    else errorMsg.value = '加载收件箱失败'
    ElMessage.error(errorMsg.value)
  } finally {
    loading.value = false
  }
}

async function handleMore() {
  if (list.value.length >= total.value) return
  pageNum.value += 1
  await loadList(false)
}

async function markRead(msg: NotifyMessage) {
  try {
    await markAsRead(msg.id)
    list.value = list.value.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error('操作失败')
  }
}

async function readAll() {
  try {
    const affected = await readAllNotify()
    ElMessage.success(affected > 0 ? `已全部标记为已读（${affected} 条）` : '没有未读通知')
    pageNum.value = 1
    await loadList(true)
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error('全部已读失败')
  }
}

/** 受保护跳转：仅打开鉴权通过的目标（前端按受控类型路由，不使用任意 URL）。 */
async function openLink(msg: NotifyMessage) {
  try {
    const target = await openNotifyLink(msg.id)
    const { linkType } = target
    const { linkId } = target
    if (linkType === 'WF_TASK' || linkType === 'WF_PROCESS') {
      void router.push({ path: '/m/workflow', query: { ref: encodeURIComponent(linkId) } })
    } else {
      ElMessage.info('该通知暂无页面跳转')
    }
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error('无权访问该业务对象')
  }
}

onMounted(() => void loadList(true))
</script>

<template>
  <div class="m-notify">
    <div class="m-notify-header">
      <h2>收件箱（未读 {{ unreadCount }}）</h2>
      <el-button size="small" type="primary" @click="readAll">全部已读</el-button>
    </div>
    <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" show-icon />
    <el-empty v-if="!loading && list.length === 0 && !errorMsg" description="暂无通知" />
    <div
      v-for="msg in list"
      :key="msg.id"
      class="m-notify-item"
      :class="{ unread: !msg.read }"
      @click="!msg.read && markRead(msg)"
    >
      <span class="dot" />
      <div class="body">
        <p class="title">{{ msg.title }}</p>
        <p class="content">{{ msg.content }}</p>
        <p class="time">{{ msg.createTime }}</p>
      </div>
      <div class="ops">
        <el-button
          v-if="msg.linkType && msg.linkId"
          size="small"
          text
          type="primary"
          @click.stop="openLink(msg)"
        >
          查看详情
        </el-button>
        <span v-else-if="!msg.read" class="ops-hint">点击标记已读</span>
      </div>
    </div>
    <el-button
      v-if="list.length < total"
      plain
      style="width: 100%"
      :loading="loading"
      @click="handleMore"
    >
      加载更多
    </el-button>
  </div>
</template>

<style scoped>
.m-notify {
  padding: 12px;
}
.m-notify-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.m-notify-header h2 {
  font-size: 18px;
  margin: 0;
}
.m-notify-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid #f0f0f0;
}
.m-notify-item .dot {
  margin-top: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  flex: none;
}
.m-notify-item.unread .dot {
  background: var(--el-color-primary, #7e306b);
}
.m-notify-item .body {
  flex: 1;
  min-width: 0;
}
.m-notify-item .title {
  margin: 0 0 4px;
  font-weight: 600;
}
.m-notify-item .content {
  margin: 0 0 4px;
  color: #909399;
  font-size: 13px;
}
.m-notify-item .time {
  margin: 0;
  color: #c0c4cc;
  font-size: 12px;
}
.m-notify-item .ops {
  flex: none;
}
.ops-hint {
  color: #c0c4cc;
  font-size: 12px;
}
</style>

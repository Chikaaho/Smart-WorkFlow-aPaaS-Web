<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * NotifyHome — 通知消息列表页（页型 B）。
 *
 * 展示当前用户的通知消息，支持标记已读、删除和查询过滤。
 * 后端返回平铺数组（不分页），前端直接渲染。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
// I6：服务端真分页收件箱 + 未读数 + 全部已读（同一消息与已读状态，多端共享）
import {
  pageNotifyInbox,
  unreadNotifyCount,
  readAllNotify,
  markAsRead,
  deleteMessage,
  openNotifyLink,
} from '@/modules/notify/api'
import type { NotifyQueryParams } from '@/modules/notify/api'
import { ApiError } from '@/foundation/request'
import { useRouter, useRoute } from 'vue-router'
import type { NotifyMessage } from '@/contracts/notify'

// ─── 列表状态 ───

const list = ref<NotifyMessage[]>([])
const total = ref(0)
const unreadCount = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const readingId = ref<number | null>(null) // 当前正在标记已读的 ID（loading 态）
const deletingId = ref<number | null>(null) // 当前正在删除的 ID（loading 态）

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// I6：服务端真分页（默认 10 条/页，稳定排序由服务端保证）
const pageNum = ref(1)
const pageSize = ref(10)

// ─── 查询过滤 ───

/**
 * 已读状态筛选（V012-BUG-008）：由侧栏「全部/已读/未读」分类经 query 驱动
 * （?read=true / ?read=false / 无 = 全部），页面内不再重复已读状态下拉。
 */
const route = useRoute()

function readFilterFromQuery(): boolean | '' {
  const value = route.query?.read
  if (value === 'true') return true
  if (value === 'false') return false
  return ''
}

const filterRead = ref<boolean | ''>(readFilterFromQuery()) // '' = 全部，true = 已读，false = 未读
const filterKeyword = ref('')

watch(
  () => route.query?.read,
  () => {
    const next = readFilterFromQuery()
    if (next !== filterRead.value) {
      filterRead.value = next
      handleFilterChange()
    }
  },
)

/** bizType → { label, type } 映射 */
const BIZ_TYPE_MAP: Record<
  string,
  { label: string; type: 'primary' | 'success' | 'warning' | 'info' | 'danger' }
> = {
  WF_TODO: {
    get label() {
      return t('notify.bizTypeTodo')
    },
    type: 'warning',
  },
  WF_APPROVED: {
    get label() {
      return t('workflow.approvalResult')
    },
    type: 'success',
  },
}

function getBizTypeTag(bizType: string): {
  label: string
  type: 'primary' | 'success' | 'warning' | 'info' | 'danger'
} {
  return BIZ_TYPE_MAP[bizType] ?? { label: bizType, type: 'info' }
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const params: NotifyQueryParams = {}
    if (filterRead.value !== '') {
      params.read = filterRead.value as boolean
    }
    if (filterKeyword.value.trim()) {
      params.keyword = filterKeyword.value.trim()
    }
    const result = await pageNotifyInbox(
      { pageNum: pageNum.value, pageSize: pageSize.value },
      Object.keys(params).length > 0 ? params : {},
    )
    list.value = result.list
    total.value = result.total
    try {
      unreadCount.value = await unreadNotifyCount()
    } catch {
      ElMessage.error(t('common.loadFailed'))
      // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
      unreadCount.value = 0
    }
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
      ElMessage.error(err.msg)
    } else {
      errorMsg.value = t('notify.listLoadFailed')
      ElMessage.error(t('notify.listLoadFailed'))
    }
  } finally {
    loading.value = false
  }
}

function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadList()
}

function handlePageSizeChange(p: number) {
  pageSize.value = p
  pageNum.value = 1
  void loadList()
}

async function handleReadAll() {
  try {
    const affected = await readAllNotify()
    ElMessage.success(
      affected > 0 ? t('notify.allMarkedRead', { affected }) : t('notify.noUnreadNotifications'),
    )
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error(t('notify.markAllReadFailed'))
  }
}

function handleFilterChange() {
  pageNum.value = 1
  void loadList()
}

function handleKeywordSearch() {
  void loadList()
}

function markRow(r: unknown) {
  void handleMarkRead(r as NotifyMessage)
}

async function handleMarkRead(row: NotifyMessage) {
  if (readingId.value !== null) return // 防重复点击
  readingId.value = row.id

  try {
    await markAsRead(row.id)
    // 替换数组项以触发响应式更新（el-table slot scope 中的 row 可能不是响应式代理）
    list.value = list.value.map((item) => (item.id === row.id ? { ...item, read: true } : item))
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(t('common.operationFailed'))
    }
  } finally {
    readingId.value = null
  }
}

function deleteRow(r: unknown) {
  void handleDelete(r as NotifyMessage)
}

async function handleDelete(row: NotifyMessage) {
  if (deletingId.value !== null) return // 防重复点击

  try {
    await ElMessageBox.confirm(t('notify.deleteConfirmMessage'), t('common.deleteConfirmTitle'), {
      get confirmButtonText() {
        return t('common.confirmDelete')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }

  deletingId.value = row.id
  try {
    await deleteMessage(row.id)
    list.value = list.value.filter((item) => item.id !== row.id)
    total.value = list.value.length
    ElMessage.success(t('common.deleteSuccess'))
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(t('common.deleteFailed'))
    }
  } finally {
    deletingId.value = null
  }
}

/** 受保护深链：服务端鉴权后按受控类型路由（不使用任意 URL），与移动端同一契约。 */
const pcRouter = useRouter()
async function openLink(row: NotifyMessage) {
  try {
    const target = await openNotifyLink(row.id)
    if (target.linkType === 'WF_TASK' || target.linkType === 'WF_PROCESS') {
      void pcRouter.push({ path: '/workflow/instances', query: { focus: target.linkId } })
    } else {
      ElMessage.info(t('notify.noLinkAvailable'))
    }
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error(t('common.noAccessToObject'))
  }
}

/** 统一操作列（V012-BUG-002）：标记已读仅未读行显示；标记/删除互斥禁用防并发 */
function rowActions(r: unknown): ListAction[] {
  const row = r as NotifyMessage
  return [
    {
      key: 'mark-read',
      label: t('notify.markRead'),
      visible: !row.read,
      loading: readingId.value === row.id,
      disabled: readingId.value !== null || deletingId.value !== null,
      onClick: () => markRow(row),
    },
    {
      key: 'jump',
      label: t('notify.jump'),
      onClick: () => openLink(row),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      loading: deletingId.value === row.id,
      disabled: readingId.value !== null || deletingId.value !== null,
      onClick: () => deleteRow(row),
    },
  ]
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('notify.messagesTitle')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 空态（无需操作按钮） -->
    <template #empty-action>
      <span />
    </template>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <!-- 过滤栏：已读状态由侧栏分类（query）驱动，页内仅保留关键词搜索（V012-BUG-008） -->
    <div class="filter-bar">
      <el-input
        v-model="filterKeyword"
        :placeholder="t('notify.searchPlaceholder')"
        clearable
        style="width: 220px"
        @keyup.enter="handleKeywordSearch"
        @clear="handleKeywordSearch"
      />
    </div>

    <!-- 表格 -->
    <el-table v-loading="loading" :data="list" stripe style="width: 100%">
      <el-table-column label="" width="40">
        <template #default="{ row }">
          <span v-if="!row.read" class="unread-dot" />
        </template>
      </el-table-column>
      <el-table-column prop="title" min-width="200">
        <template #header>
          <span>{{ t('notify.titleWithUnread', { unreadCount }) }}</span>
          <el-button
            size="small"
            text
            type="primary"
            style="margin-left: 8px"
            @click="handleReadAll"
          >
            {{ t('notify.markAllRead') }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column :label="t('notify.contentPreview')" min-width="300">
        <template #default="{ row }">
          <span class="content-preview">{{ row.content }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.type')" width="120">
        <template #default="{ row }">
          <el-tag :type="getBizTypeTag(row.bizType).type" size="small" disable-transitions>
            {{ getBizTypeTag(row.bizType).label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createTime" :label="t('common.time')" width="180" />
      <ListActionsColumn :actions="rowActions" :width="150" />
    </el-table>
  </StandardListTemplate>
</template>

<style scoped>
.unread-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-primary);
}
.content-preview {
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
  max-width: 100%;
}
.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
</style>

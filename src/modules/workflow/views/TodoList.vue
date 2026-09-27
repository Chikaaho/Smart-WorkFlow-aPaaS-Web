<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * TodoList — 我的待办列表页（页型 B）。
 *
 * 展示当前用户待审批任务，提供「审批通过」「驳回」操作按钮，
 * 支持行点击导航到任务详情页。真分页模式。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { queryTodoTasks, acceptTaskAction, pollCommandStatus } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { TodoTask } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { queryCatalogItems, type CatalogItem } from '@/modules/workflow/api/oa'

const router = useRouter()

// ─── 定位分类（V012-BUG-010 参考蓝凌「定位分类」） ───
const catalogItems = ref<CatalogItem[]>([])
const activeCategory = ref<number | 'all'>('all')

const defKeyCategory = computed(() => {
  const map = new Map<string, number | null>()
  for (const item of catalogItems.value) {
    map.set(item.itemKey, item.categoryId)
  }
  return map
})

const categoryOptions = computed(() => {
  const byId = new Map<number, string>()
  for (const item of catalogItems.value) {
    if (item.categoryId != null && !byId.has(item.categoryId)) {
      byId.set(
        item.categoryId,
        catalogItems.value.find((c) => c.categoryId === item.categoryId)?.name ??
          t('workflow.uncategorized'),
      )
    }
  }
  return Array.from(byId, ([id, name]) => ({ id, name }))
})

const filteredList = computed(() => {
  if (activeCategory.value === 'all') return list.value
  return list.value.filter((row) => {
    const cat = row.processDefKey ? defKeyCategory.value.get(row.processDefKey) : undefined
    if (activeCategory.value === 0)
      return cat == null || !defKeyCategory.value.has(row.processDefKey ?? '')
    return cat === activeCategory.value
  })
})

function selectCategory(id: number | 'all') {
  activeCategory.value = id
}

// ─── 列表状态 ───

const list = ref<TodoTask[]>([])
const total = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const approvingId = ref<string | null>(null) // 当前正在审批的任务 ID（loading 态）
const rejectingId = ref<string | null>(null) // 当前正在驳回的任务 ID（loading 态）

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// 真分页
const pageNum = ref(1)
const pageSize = ref(10)

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await queryTodoTasks(pageQuery)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('workflow.todoTaskLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadList()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadList()
}

// ─── 行操作 ───

/**
 * 操作列（V012-BUG-002）：通过 / 驳回两个直显按钮，
 * 保留行级 loading 与审批进行中的互斥 disabled。
 */
function rowActions(row: unknown): ListAction[] {
  const item = row as TodoTask
  const busy = approvingId.value !== null || rejectingId.value !== null
  return [
    {
      key: 'approve',
      label: t('common.approve'),
      type: 'primary',
      loading: approvingId.value === item.taskId,
      disabled: busy,
      onClick: () => void handleApprove(item),
    },
    {
      key: 'reject',
      label: t('common.reject'),
      type: 'danger',
      loading: rejectingId.value === item.taskId,
      disabled: busy,
      onClick: () => void handleReject(item),
    },
  ]
}

/**
 * 异步命令通道公共链路：受理（ACCEPTED ≠ 成功）→ 轮询命令状态到终态。
 * COMPLETED → 成功提示并从列表移除；FAILED → 展示失败原因并刷新；
 * 超时未终态 → 如实提示「处理中」，不伪装成功。
 */
async function runTaskAction(
  row: TodoTask,
  action: 'complete' | 'reject',
  successMsg: string,
  failMsg: string,
): Promise<void> {
  try {
    const accept = await acceptTaskAction(row.taskId, action)
    const finalStatus = await pollCommandStatus(accept.commandId)
    if (finalStatus?.status === 'COMPLETED') {
      ElMessage.success(successMsg)
      list.value = list.value.filter((t) => t.taskId !== row.taskId)
      total.value = list.value.length
    } else if (finalStatus?.status === 'FAILED') {
      ElMessage.error(finalStatus.failureReason ?? failMsg)
      await loadList()
    } else {
      ElMessage.warning(t('common.processingCheckLater'))
      await loadList()
    }
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(failMsg)
    }
    approvingId.value = null
    rejectingId.value = null
  }
}

async function handleApprove(row: TodoTask) {
  // 防重复点击：在显示确认框前锁定，阻止快速点击创建多个对话框
  if (approvingId.value || rejectingId.value) return
  approvingId.value = row.taskId

  let confirmed = false
  try {
    await ElMessageBox.confirm(t('workflow.confirmApprove'), t('workflow.approveConfirmTitle'), {
      get confirmButtonText() {
        return t('common.approve')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'info',
    })
    confirmed = true
  } catch {
    return // 用户取消
  } finally {
    if (!confirmed) approvingId.value = null
  }
  await runTaskAction(
    row,
    'complete',
    t('common.statusApproved'),
    t('workflow.approveActionFailed'),
  )
  approvingId.value = null
}

async function handleReject(row: TodoTask) {
  if (rejectingId.value || approvingId.value) return
  rejectingId.value = row.taskId

  let confirmed = false
  try {
    await ElMessageBox.confirm(t('workflow.confirmReject'), t('workflow.rejectConfirmTitle'), {
      get confirmButtonText() {
        return t('common.reject')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'warning',
    })
    confirmed = true
  } catch {
    return // 用户取消
  } finally {
    if (!confirmed) rejectingId.value = null
  }
  await runTaskAction(row, 'reject', t('common.statusRejected'), t('workflow.rejectActionFailed'))
  rejectingId.value = null
}

function handleRowClick(row: TodoTask) {
  router.push({ name: 'TaskDetail', params: { taskId: row.taskId } })
}

void queryCatalogItems({ pageNum: 1, pageSize: 200 }).then((page) => {
  catalogItems.value = page.list
})

onMounted(loadList)
</script>

<template>
  <!-- V012-BUG-010：定位分类（参考蓝凌）——按目录分类过滤本人待办 -->
  <div class="todo-locator">
    <span class="todo-locator__label">{{ t('workflow.locateCategory') }}</span>
    <button
      type="button"
      class="todo-locator__chip"
      :class="{ 'is-active': activeCategory === 'all' }"
      @click="selectCategory('all')"
    >
      {{ t('catalog.allProcesses') }}
    </button>
    <button
      v-for="opt in categoryOptions"
      :key="opt.id"
      type="button"
      class="todo-locator__chip"
      :class="{ 'is-active': activeCategory === opt.id }"
      @click="selectCategory(opt.id)"
    >
      {{ opt.name }}
    </button>
  </div>
  <StandardListTemplate
    :title="t('workflow.myTodoTitle')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏操作按钮 -->
    <template #toolbar-actions>
      <el-button @click="router.push({ name: 'ProcessedList' })">{{
        t('workflow.processedTasks')
      }}</el-button>
      <el-button type="primary" plain @click="router.push('/workflow/batch-approval')">{{
        t('workflow.batchApproval')
      }}</el-button>
    </template>

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

    <!-- 表格 -->
    <el-table
      v-loading="loading"
      :data="filteredList"
      stripe
      highlight-current-row
      style="width: 100%"
      @row-click="handleRowClick"
    >
      <!-- V012-BUG-010：列改版 主题/流程状态/申请单编号/申请人/接收时间；去 formKey 噪音列 -->
      <el-table-column type="index" :label="t('common.indexNo')" width="70" />
      <el-table-column :label="t('common.theme')" min-width="220">
        <template #default="{ row }">
          <span class="todo-theme">{{ row.theme || row.processName || '—' }}</span>
          <span v-if="row.theme" class="todo-theme__process">{{ row.processName }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.flowStatus')" width="100">
        <template #default>
          <el-tag size="small" type="warning">{{ t('workflow.pendingReview') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="businessKey" :label="t('common.businessNo')" min-width="140" />
      <el-table-column :label="t('workflow.applicant')" min-width="110">
        <template #default="{ row }">{{ row.initiatorName || '—' }}</template>
      </el-table-column>
      <el-table-column prop="createTime" :label="t('workflow.receiveTime')" min-width="170" />
      <ListActionsColumn :actions="rowActions" :width="120" />
    </el-table>
  </StandardListTemplate>
</template>

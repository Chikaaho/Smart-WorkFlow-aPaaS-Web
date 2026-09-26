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

const router = useRouter()

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

function formatTaskId(taskId: string): string {
  // 短显示：取后 8 字符
  return taskId.length > 8 ? `...${taskId.slice(-8)}` : taskId
}

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

onMounted(loadList)
</script>

<template>
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
      :data="list"
      stripe
      highlight-current-row
      style="width: 100%"
      @row-click="handleRowClick"
    >
      <el-table-column :label="t('common.taskNo')" min-width="140">
        <template #default="{ row }">
          <span :title="row.taskId">{{ formatTaskId(row.taskId) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="processName" :label="t('common.processName')" min-width="140" />
      <el-table-column prop="formKey" :label="t('common.formKey')" min-width="140" />
      <el-table-column prop="businessKey" :label="t('common.businessNo')" min-width="120" />
      <el-table-column prop="createTime" :label="t('common.createTime')" min-width="170" />
      <ListActionsColumn :actions="rowActions" :width="120" />
    </el-table>
  </StandardListTemplate>
</template>

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
import { ElMessage, ElMessageBox } from 'element-plus'
import { ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { queryTodoTasks, claimTask } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { TodoTask } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import TaskDetailDialog from '../components/TaskDetailDialog.vue'

// ─── 列表状态 ───

const list = ref<TodoTask[]>([])
const total = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const claimingId = ref<string | null>(null) // 正在领取的候选任务 ID（P64 阶段Ⅱ）

// ─── 详情弹窗（与已办/抄送/表单数据共用同一只读详情布局；待办额外带审批区） ───
const detailVisible = ref(false)
const detailTaskId = ref('')

function openDetail(row: TodoTask) {
  detailTaskId.value = row.taskId
  detailVisible.value = true
}

async function onDetailCompleted() {
  await loadList()
}

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
 * 操作列（V012-BUG-002）：候选组先领取；审批动作统一在详情弹窗底部「审批」区完成。
 */
function rowActions(row: unknown): ListAction[] {
  const item = row as TodoTask
  // P64 阶段Ⅱ：候选组任务（assignee 为空）唯一合法入口=先领取；
  // 领取后由本人办理，其他候选人不再可见（竞争单结果由服务端保证）
  if (item.candidate) {
    return [
      {
        key: 'claim',
        label: t('workflow.claimTask'),
        type: 'primary',
        loading: claimingId.value === item.taskId,
        disabled: claimingId.value !== null,
        onClick: () => void handleClaim(item),
      },
    ]
  }
  return [
    {
      key: 'detail',
      label: t('common.detail'),
      onClick: () => openDetail(item),
    },
  ]
}

async function handleClaim(row: TodoTask) {
  if (claimingId.value) return
  claimingId.value = row.taskId

  let confirmed = false
  try {
    await ElMessageBox.confirm(t('workflow.claimConfirm'), t('workflow.claimConfirmTitle'), {
      get confirmButtonText() {
        return t('workflow.claimTask')
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
    if (!confirmed) claimingId.value = null
  }
  try {
    await claimTask(row.taskId)
    ElMessage.success(t('workflow.claimSuccess'))
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(t('workflow.claimFailed'))
    }
  } finally {
    claimingId.value = null
    await loadList()
  }
}

function handleRowClick(row: TodoTask) {
  openDetail(row)
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 0.1.7 #8：去掉右上角「已办任务 / 批量审批」按钮（噪音） -->

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
      <!-- V012-BUG-010：列改版 主题/流程状态/申请单编号/申请人/接收时间；去 formKey 噪音列 -->
      <el-table-column type="index" :label="t('common.indexNo')" width="70" />
      <el-table-column :label="t('common.theme')" min-width="220">
        <template #default="{ row }">
          <span class="todo-theme">{{ row.theme || row.processName || '—' }}</span>
          <span v-if="row.theme" class="todo-theme__process">{{ row.processName }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.flowStatus')" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.candidate" size="small" type="info">{{
            t('workflow.candidatePending')
          }}</el-tag>
          <el-tag v-else size="small" type="warning">{{ t('workflow.pendingReview') }}</el-tag>
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

  <TaskDetailDialog
    v-model="detailVisible"
    :task-id="detailTaskId"
    @completed="onDetailCompleted"
  />
</template>

<script setup lang="ts">
/**
 * TodoList — 我的待办列表页（页型 B）。
 *
 * 展示当前用户待审批任务，提供「审批通过」「驳回」操作按钮，
 * 支持行点击导航到任务详情页。真分页模式。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import { queryTodoTasks, completeTask, rejectTask } from '@/modules/workflow/api'
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
      errorMsg.value = '加载待办任务失败'
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

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数
function approveRow(r: unknown) {
  void handleApprove(r as TodoTask)
}

function rejectRow(r: unknown) {
  void handleReject(r as TodoTask)
}

async function handleApprove(row: TodoTask) {
  // 防重复点击：在显示确认框前锁定，阻止快速点击创建多个对话框
  if (approvingId.value || rejectingId.value) return
  approvingId.value = row.taskId

  let confirmed = false
  try {
    await ElMessageBox.confirm('确认审批通过此任务？', '审批确认', {
      confirmButtonText: '通过',
      cancelButtonText: '取消',
      type: 'info',
    })
    confirmed = true
  } catch {
    return // 用户取消
  } finally {
    if (!confirmed) approvingId.value = null
  }
  try {
    await completeTask(row.taskId)
    ElMessage.success('审批通过')
    // 从列表中移除已审批的任务
    list.value = list.value.filter((t) => t.taskId !== row.taskId)
    total.value = list.value.length
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('审批操作失败')
    }
  } finally {
    approvingId.value = null
  }
}

async function handleReject(row: TodoTask) {
  if (rejectingId.value || approvingId.value) return
  rejectingId.value = row.taskId

  let confirmed = false
  try {
    await ElMessageBox.confirm('确认驳回此任务？', '驳回确认', {
      confirmButtonText: '驳回',
      cancelButtonText: '取消',
      type: 'warning',
    })
    confirmed = true
  } catch {
    return // 用户取消
  } finally {
    if (!confirmed) rejectingId.value = null
  }
  try {
    await rejectTask(row.taskId)
    ElMessage.success('已驳回')
    list.value = list.value.filter((t) => t.taskId !== row.taskId)
    total.value = list.value.length
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('驳回操作失败')
    }
  } finally {
    rejectingId.value = null
  }
}

function handleRowClick(row: TodoTask) {
  router.push({ name: 'TaskDetail', params: { taskId: row.taskId } })
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="我的待办"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏操作按钮 -->
    <template #toolbar-actions>
      <el-button @click="router.push({ name: 'ProcessedList' })">已办任务</el-button>
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
      <el-table-column label="任务编号" min-width="140">
        <template #default="{ row }">
          <span :title="row.taskId">{{ formatTaskId(row.taskId) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="processName" label="流程名称" min-width="140" />
      <el-table-column prop="formKey" label="表单标识" min-width="140" />
      <el-table-column prop="businessKey" label="业务单号" min-width="120" />
      <el-table-column prop="createTime" label="创建时间" min-width="170" />
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            type="primary"
            :loading="approvingId === row.taskId"
            :disabled="approvingId !== null || rejectingId !== null"
            @click.stop="approveRow(row)"
          >
            通过
          </el-button>
          <el-button
            size="small"
            type="danger"
            :loading="rejectingId === row.taskId"
            :disabled="approvingId !== null || rejectingId !== null"
            @click.stop="rejectRow(row)"
          >
            驳回
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>
</template>

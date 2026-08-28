<script setup lang="ts">
/**
 * TaskDetail — 任务详情页。
 *
 * 展示任务详情信息、流程变量、审批历史，提供通过/驳回操作。
 * 路由参数：taskId
 */
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { queryTaskDetail, completeTask, rejectTask } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { TaskDetail } from '@/contracts/bpm'

const router = useRouter()
const route = useRoute()

const taskId = route.params.taskId as string

// ─── 页面状态 ───
const detail = ref<TaskDetail | null>(null)
const loading = ref(false)
const errorMsg = ref('')
const acting = ref<string | null>(null) // 'approve' | 'reject' | null

function formatTaskId(id: string): string {
  return id.length > 8 ? `...${id.slice(-8)}` : id
}

async function loadDetail() {
  loading.value = true
  errorMsg.value = ''
  try {
    detail.value = await queryTaskDetail(taskId)
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载任务详情失败'
    }
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.push({ name: 'TodoList' })
}

async function handleApprove() {
  if (acting.value) return
  acting.value = 'approve'

  let confirmed = false
  try {
    await ElMessageBox.confirm('确认审批通过此任务？', '审批确认', {
      confirmButtonText: '通过',
      cancelButtonText: '取消',
      type: 'info',
    })
    confirmed = true
  } catch {
    return
  } finally {
    if (!confirmed) acting.value = null
  }
  try {
    await completeTask(taskId)
    ElMessage.success('审批通过')
    router.push({ name: 'TodoList' })
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('审批操作失败')
    }
    acting.value = null
  }
}

async function handleReject() {
  if (acting.value) return
  acting.value = 'reject'

  let confirmed = false
  try {
    await ElMessageBox.confirm('确认驳回此任务？', '驳回确认', {
      confirmButtonText: '驳回',
      cancelButtonText: '取消',
      type: 'warning',
    })
    confirmed = true
  } catch {
    return
  } finally {
    if (!confirmed) acting.value = null
  }
  try {
    await rejectTask(taskId)
    ElMessage.success('已驳回')
    router.push({ name: 'TodoList' })
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('驳回操作失败')
    }
    acting.value = null
  }
}

function formatVariables(vars: Record<string, unknown>): [string, string][] {
  return Object.entries(vars).map(([k, v]) => [k, String(v)])
}

// ─── 审批结果映射 ───
const APPROVAL_RESULT_MAP: Record<string, { label: string; type: 'success' | 'danger' | 'info' }> =
  {
    APPROVED: { label: '通过', type: 'success' },
    REJECTED: { label: '驳回', type: 'danger' },
  }

function getApprovalResultLabel(result: string | null): string {
  if (!result) return '进行中'
  return APPROVAL_RESULT_MAP[result]?.label ?? result
}

function getApprovalResultType(result: string | null): 'success' | 'danger' | 'info' {
  if (!result) return 'info'
  return APPROVAL_RESULT_MAP[result]?.type ?? 'info'
}

onMounted(loadDetail)
</script>

<template>
  <div v-loading="loading" class="task-detail">
    <!-- 顶栏 -->
    <div class="detail-header">
      <el-button @click="goBack">← 返回待办</el-button>
      <h2>任务详情</h2>
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <!-- 任务信息 -->
    <el-card v-if="detail" class="detail-card">
      <template #header><span>基本信息</span></template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="任务名称">{{ detail.taskName }}</el-descriptions-item>
        <el-descriptions-item label="任务编号">
          <span :title="detail.taskId">{{ formatTaskId(detail.taskId) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="流程名称">{{
          detail.processName ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="流程标识">{{
          detail.processDefinitionKey
        }}</el-descriptions-item>
        <el-descriptions-item label="表单标识">{{ detail.formKey }}</el-descriptions-item>
        <el-descriptions-item label="业务单号">{{ detail.businessKey }}</el-descriptions-item>
        <el-descriptions-item label="当前审批人">{{ detail.assignee }}</el-descriptions-item>
        <el-descriptions-item label="发起人 ID">{{ detail.initiatorId }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detail.createTime }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 流程变量 -->
    <el-card v-if="detail && Object.keys(detail.processVariables).length > 0" class="detail-card">
      <template #header><span>流程变量</span></template>
      <el-table :data="formatVariables(detail.processVariables)" stripe>
        <el-table-column prop="0" label="变量名" min-width="180" />
        <el-table-column prop="1" label="变量值" min-width="280" />
      </el-table>
    </el-card>

    <!-- 审批历史 -->
    <el-card v-if="detail" class="detail-card">
      <template #header><span>审批历史</span></template>
      <el-alert
        v-if="detail.approvalHistory.length === 0"
        title="暂无审批历史"
        type="info"
        :closable="false"
        show-icon
      />
      <el-table v-else :data="detail.approvalHistory" stripe>
        <el-table-column label="任务编号" min-width="140">
          <template #default="{ row }">
            <span :title="row.taskId">{{ formatTaskId(row.taskId) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="taskName" label="任务名称" min-width="120" />
        <el-table-column prop="assignee" label="审批人" min-width="100" />
        <el-table-column label="审批结果" min-width="100">
          <template #default="{ row }">
            <el-tag :type="getApprovalResultType(row.approvalResult)" size="small">
              {{ getApprovalResultLabel(row.approvalResult) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" min-width="170" />
        <el-table-column label="完成时间" min-width="170">
          <template #default="{ row }">
            {{ row.endTime ?? '-' }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 操作栏 -->
    <div v-if="detail" class="detail-actions">
      <el-button
        type="primary"
        size="large"
        :loading="acting === 'approve'"
        :disabled="acting !== null"
        @click="handleApprove"
      >
        审批通过
      </el-button>
      <el-button
        type="danger"
        size="large"
        :loading="acting === 'reject'"
        :disabled="acting !== null"
        @click="handleReject"
      >
        驳回
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.task-detail {
  padding: 16px;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.detail-header h2 {
  margin: 0;
}
.detail-card {
  margin-bottom: 16px;
}
.detail-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 24px 0;
}
</style>

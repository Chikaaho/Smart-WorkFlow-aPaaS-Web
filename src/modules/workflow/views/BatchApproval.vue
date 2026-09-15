<script setup lang="ts">
/**
 * BatchApproval — 批量审批（I4 §3.5）。
 * 仅展示本人当前待办；提交后服务端逐项校验（归属/状态/意见要求/权限），
 * 返回逐项成功/失败；单项失败不掩盖其他项真实结果。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import { queryTodoTasks } from '@/modules/workflow/api'
import { batchTaskAction, type BatchItemResult } from '@/modules/workflow/api/i4'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

interface TodoRow {
  taskId: string
  name?: string
  processDefinitionKey?: string
  processInstanceId?: string
  createTime?: string
}

const list = ref<TodoRow[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const selected = ref<TodoRow[]>([])
const comment = ref('')
const submitting = ref(false)
const results = ref<BatchItemResult[]>([])
const resultVisible = ref(false)

const isEmpty = computed(() => !loading.value && list.value.length === 0)

async function loadList() {
  loading.value = true
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await queryTodoTasks(pageQuery)
    list.value = (result.list ?? []) as unknown as TodoRow[]
    total.value = result.total
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '待办加载失败')
  } finally {
    loading.value = false
  }
}

async function submitBatch(action: 'APPROVE' | 'DISAPPROVE') {
  if (selected.value.length === 0) {
    ElMessage.warning('请先选择要批量办理的任务')
    return
  }
  if (action === 'DISAPPROVE' && !comment.value.trim()) {
    ElMessage.warning('批量不通过必须填写意见')
    return
  }
  submitting.value = true
  try {
    const response = await batchTaskAction(
      selected.value.map((row) => ({
        taskId: row.taskId,
        action,
        comment: comment.value || undefined,
      })),
    )
    results.value = response.results
    resultVisible.value = true
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '批量提交失败')
  } finally {
    submitting.value = false
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

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="批量审批"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <el-input
        v-model="comment"
        type="textarea"
        :rows="1"
        placeholder="批量意见（不通过时必填；强制意见表单节点仍需逐项提交意见表单）"
        style="flex: 1"
      />
      <el-button type="success" :loading="submitting" @click="submitBatch('APPROVE')">
        批量通过
      </el-button>
      <el-button type="danger" :loading="submitting" @click="submitBatch('DISAPPROVE')">
        批量不通过
      </el-button>
    </template>

    <el-table
      v-loading="loading"
      :data="list"
      @selection-change="(rows: TodoRow[]) => (selected = rows)"
    >
      <el-table-column type="selection" width="46" />
      <el-table-column label="任务 ID" min-width="180">
        <template #default="{ $index }">{{ list[$index]?.taskId }}</template>
      </el-table-column>
      <el-table-column label="任务名称" min-width="140">
        <template #default="{ $index }">{{ list[$index]?.name }}</template>
      </el-table-column>
      <el-table-column label="流程定义" min-width="140">
        <template #default="{ $index }">{{ list[$index]?.processDefinitionKey }}</template>
      </el-table-column>
      <template #empty>暂无可批量办理的待办</template>
    </el-table>

    <el-dialog v-model="resultVisible" title="批量办理结果（逐项）" width="640px">
      <el-table :data="results" size="small">
        <el-table-column prop="taskId" label="任务 ID" min-width="170" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row?.success ? 'success' : 'danger'">
              {{ row?.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="失败原因" min-width="200">
          <template #default="{ row }">{{ row?.message || '—' }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </StandardListTemplate>
</template>

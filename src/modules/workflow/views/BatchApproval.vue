<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
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
/** 批量结果汇总：总量 / 成功 / 失败 / 处理中 —— 批量审批是同步逐项执行，处理中恒为 0 */
const summary = ref({ total: 0, success: 0, failed: 0, processing: 0 })

const isEmpty = computed(() => !loading.value && list.value.length === 0)

async function loadList() {
  loading.value = true
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await queryTodoTasks(pageQuery)
    list.value = (result.list ?? []) as unknown as TodoRow[]
    total.value = result.total
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.todoLoadFailed'))
  } finally {
    loading.value = false
  }
}

async function submitBatch(action: 'APPROVE' | 'DISAPPROVE') {
  if (selected.value.length === 0) {
    ElMessage.warning(t('workflow.selectBatchTasks'))
    return
  }
  if (action === 'DISAPPROVE' && !comment.value.trim()) {
    ElMessage.warning(t('workflow.batchRejectNeedsComment'))
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
    // R2c：汇总四项计数全部取服务端返回值，不由前端按行数推算，保证与实际结果一致。
    // 处理中由服务端同步契约显式给出（恒为 0），显示它而不是省略这一栏。
    summary.value = {
      total: response.total,
      success: response.success,
      failed: response.failed,
      processing: response.processing,
    }
    resultVisible.value = true
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.batchSubmitFailed'))
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
    :title="t('workflow.batchApproval')"
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
        :placeholder="t('workflow.batchCommentHint')"
        style="flex: 1"
      />
      <el-button type="success" :loading="submitting" @click="submitBatch('APPROVE')">
        {{ t('workflow.batchApprove') }}
      </el-button>
      <el-button type="danger" :loading="submitting" @click="submitBatch('DISAPPROVE')">
        {{ t('workflow.batchDisapprove') }}
      </el-button>
    </template>

    <el-table
      v-loading="loading"
      :data="list"
      @selection-change="(rows: TodoRow[]) => (selected = rows)"
    >
      <el-table-column type="selection" width="46" />
      <el-table-column :label="t('common.taskId')" min-width="180">
        <template #default="{ $index }">{{ list[$index]?.taskId }}</template>
      </el-table-column>
      <el-table-column :label="t('common.taskName')" min-width="140">
        <template #default="{ $index }">{{ list[$index]?.name }}</template>
      </el-table-column>
      <el-table-column :label="t('common.processDef')" min-width="140">
        <template #default="{ $index }">{{ list[$index]?.processDefinitionKey }}</template>
      </el-table-column>
      <template #empty>{{ t('workflow.noBatchTodos') }}</template>
    </el-table>

    <el-dialog v-model="resultVisible" :title="t('workflow.batchResults')" width="720px">
      <el-descriptions :column="4" border class="batch-summary">
        <el-descriptions-item :label="t('common.total')">
          <span data-testid="batch-approval-total">{{ summary.total }}</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.resultSuccess')">
          <span data-testid="batch-approval-success">{{ summary.success }}</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.resultFailed')">
          <span data-testid="batch-approval-failed">{{ summary.failed }}</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.resultProcessing')">
          <span data-testid="batch-approval-processing">{{ summary.processing }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <p class="batch-processing-note" data-testid="batch-approval-processing-note">
        {{ t('workflow.batchProcessingNote') }}
      </p>
      <el-table :data="results" size="small">
        <el-table-column prop="taskId" :label="t('common.taskId')" min-width="170" />
        <el-table-column :label="t('common.result')" width="90">
          <template #default="{ row }">
            <el-tag :type="row?.success ? 'success' : 'danger'">
              {{ row?.success ? t('common.resultSuccess') : t('common.resultFailed') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" :label="t('common.failureReason')" min-width="200">
          <template #default="{ row }">{{ row?.message || '—' }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </StandardListTemplate>
</template>

<style scoped>
.batch-processing-note {
  margin: 12px 0 0;
  font-size: 12px;
  color: #909399;
}
</style>

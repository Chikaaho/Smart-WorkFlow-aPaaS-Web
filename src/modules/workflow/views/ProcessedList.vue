<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ProcessedList — 已办任务列表页（页型 B）。
 *
 * 分页展示当前用户已办理完成的任务，支持点击行跳转详情。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { StandardListTemplate } from '@/components/page-layout'
import { queryProcessedTasks } from '@/modules/workflow/api'
import type { ProcessedTask } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

const router = useRouter()

// ─── 列表状态 ───
const list = ref<ProcessedTask[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await queryProcessedTasks(pageQuery)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('workflow.processedTasksLoadFailed')
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

function handleRowClick(row: ProcessedTask) {
  router.push({ name: 'TaskDetail', params: { taskId: row.taskId } })
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('workflow.processedTasks')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏操作按钮 -->
    <template #toolbar-actions>
      <el-button @click="router.push({ name: 'TodoList' })">{{
        t('workflow.todoTasks')
      }}</el-button>
    </template>

    <!-- 空态 -->
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
      <el-table-column prop="taskName" :label="t('common.taskName')" min-width="140" />
      <el-table-column :label="t('common.processName')" min-width="140">
        <template #default="{ row }">
          {{ row.processName ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="formKey" :label="t('common.formKey')" min-width="140" />
      <el-table-column prop="businessKey" :label="t('common.businessNo')" min-width="120" />
      <el-table-column prop="createTime" :label="t('common.createTime')" min-width="170" />
      <el-table-column :label="t('workflow.completedAt')" min-width="170">
        <template #default="{ row }">
          {{ row.endTime ?? '-' }}
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>
</template>

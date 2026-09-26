<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * MyProcessed — 我的已办列表页（新契约，页型 B）。
 *
 * 展示当前用户办理过的任务：审批动作、办理时间、实例状态与来源标记
 * （ACTION=动作通道 / HISTORY_COMPAT=历史兼容）。分页 + 来源筛选。
 */
import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { myProcessed } from '@/modules/workflow/api'
import type { MyProcessedItem } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

const router = useRouter()

// ─── 列表状态 ───
const list = ref<MyProcessedItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<{ source: string }>({ source: '' })

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

const ACTION_TAG: Record<string, { label: string; type: 'success' | 'danger' | 'warning' }> = {
  APPROVE: {
    get label() {
      return t('common.approve')
    },
    type: 'success',
  },
  REJECT: {
    get label() {
      return t('common.reject')
    },
    type: 'danger',
  },
  RETURN: {
    get label() {
      return t('common.returnBack')
    },
    type: 'warning',
  },
}

const INSTANCE_STATUS_TAG: Record<
  string,
  { label: string; type: 'warning' | 'success' | 'danger' }
> = {
  RUNNING: {
    get label() {
      return t('common.statusInProgress')
    },
    type: 'warning',
  },
  APPROVED: {
    get label() {
      return t('common.statusApproved')
    },
    type: 'success',
  },
  REJECTED: {
    get label() {
      return t('common.statusRejected')
    },
    type: 'danger',
  },
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await myProcessed(pageQuery, {
      source: filter.source || undefined,
    })
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('workflow.processedLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.source = ''
  pageNum.value = 1
  void loadList()
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

/** 详情跳转：携带 source=processed，详情页按已办只读渲染并回跳本列表（对齐 ProcessedList） */
function openDetail(row: MyProcessedItem) {
  void router.push({
    name: 'TaskDetail',
    params: { taskId: row.taskId },
    query: { source: 'processed' },
  })
}

// 操作列（V012-BUG-002）：单按钮「详情」
function rowActions(row: unknown): ListAction[] {
  const item = row as MyProcessedItem
  return [
    {
      key: 'detail',
      label: t('common.detail'),
      onClick: () => openDetail(item),
    },
  ]
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('workflow.myProcessed')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 筛选区 -->
    <template #filter>
      <el-select
        v-model="filter.source"
        :placeholder="t('common.source')"
        clearable
        style="width: 180px"
        @change="handleSearch"
      >
        <el-option :label="t('workflow.sourceAction')" value="ACTION" />
        <el-option :label="t('workflow.sourceHistoryCompat')" value="HISTORY_COMPAT" />
      </el-select>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleSearch">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
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
    <el-table v-loading="loading" :data="list" stripe style="width: 100%">
      <el-table-column prop="taskName" :label="t('common.taskName')" min-width="130" />
      <el-table-column :label="t('common.processName')" min-width="140">
        <template #default="{ row }">
          {{ row.processName ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="formKey" :label="t('common.formKey')" min-width="130" />
      <el-table-column prop="businessKey" :label="t('common.businessNo')" min-width="120" />
      <el-table-column :label="t('common.action')" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.action" :type="ACTION_TAG[row.action]?.type ?? 'info'" size="small">
            {{ ACTION_TAG[row.action]?.label ?? row.action }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.handledAt')" min-width="170">
        <template #default="{ row }">
          {{ row.handleTime ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.instanceStatus')" width="100">
        <template #default="{ row }">
          <el-tag
            v-if="row.instanceStatus"
            :type="INSTANCE_STATUS_TAG[row.instanceStatus]?.type ?? 'info'"
            size="small"
          >
            {{ INSTANCE_STATUS_TAG[row.instanceStatus]?.label ?? row.instanceStatus }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.source')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.source === 'ACTION' ? 'success' : 'info'" size="small" effect="plain">
            {{
              row.source === 'ACTION'
                ? t('workflow.sourceAction')
                : t('workflow.sourceHistoryCompat')
            }}
          </el-tag>
        </template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="90" />
    </el-table>
  </StandardListTemplate>
</template>

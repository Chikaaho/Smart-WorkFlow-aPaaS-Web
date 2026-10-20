<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * MyCc — 抄送我的（v0.0.2 OA 个人办理，页型 B）。
 *
 * 仅本人收到的抄送（服务端强制 recipient=当前用户），关键字 + 时间窗过滤，
 * 稳定分页；详情与任务详情共用业务表单只读展示和流程信息面板，只呈现业务名称与业务状态。
 * 抄送身份不含审批操作权（无同意/驳回入口）。
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { ListFilterItem, ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  queryMyCopies,
  queryMyCopyDetail,
  type MyCopyItem,
  type MyCopyDetail,
} from '@/modules/workflow/api/oa'
import type { ApprovalHistoryItem } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import BusinessDetailDialog from '@/components/business-detail/BusinessDetailDialog.vue'
import { useWorkflowDisplayNames } from '../composables/use-workflow-display-names'

const list = ref<MyCopyItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')
const { ensureProcess, ensureForm, processName, formName, nodeName } = useWorkflowDisplayNames()

const filter = reactive<{
  processInstanceId: string
  keyword: string
  timeRange: [string, string] | null
}>({
  processInstanceId: '',
  keyword: '',
  timeRange: null,
})

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

function formatTime(value: unknown): string {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 16)
}

function primeDisplayNames(rows: MyCopyItem[]) {
  for (const row of rows) {
    void ensureProcess(row.processDefKey)
    void ensureForm(row.formKey)
  }
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await queryMyCopies(pageQuery, {
      processInstanceId: filter.processInstanceId.trim() || undefined,
      keyword: filter.keyword.trim() || undefined,
      timeFrom: filter.timeRange?.[0],
      timeTo: filter.timeRange?.[1],
    })
    list.value = result.list
    total.value = result.total
    primeDisplayNames(result.list)
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('workflow.ccListLoadFailed')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.processInstanceId = ''
  filter.keyword = ''
  filter.timeRange = null
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

// ─── 详情弹窗 ───
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<MyCopyDetail | null>(null)

async function openDetail(row: MyCopyItem) {
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await queryMyCopyDetail(row.id)
    if (detailProcessKey.value) {
      void ensureProcess(detailProcessKey.value)
      void ensureForm(detailFormKey.value)
    }
    detailVisible.value = true
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.ccDetailLoadFailed'))
  } finally {
    detailLoading.value = false
  }
}

/** 操作列（V012-BUG-002）：单按钮「详情」（抄送身份无审批操作权，仅查看） */
function rowActions(row: unknown): ListAction[] {
  const item = row as MyCopyItem
  return [
    {
      key: 'detail',
      label: t('common.detail'),
      onClick: () => void openDetail(item),
    },
  ]
}

/** 模板展示桥接：instance/copy 以索引签名访问，避免模板内类型断言。 */
const detailInstance = computed<Record<string, unknown> | null>(() => {
  const raw = detail.value?.instance
  return raw ? (raw as Record<string, unknown>) : null
})

const detailCopy = computed<Record<string, unknown>>(() => {
  const raw = detail.value?.copy ?? {}
  return raw as Record<string, unknown>
})

const detailFormData = computed<Record<string, unknown> | null>(() => {
  const raw = detail.value?.formData
  return raw ? (raw as Record<string, unknown>) : null
})

const detailProcessKey = computed(() =>
  String(detailCopy.value.processDefKey ?? detailInstance.value?.processDefKey ?? ''),
)
const detailFormKey = computed(() =>
  String(detailCopy.value.formKey ?? detailInstance.value?.formKey ?? ''),
)
const detailNodeKey = computed(() => String(detailCopy.value.nodeKey ?? ''))

/** 抄送详情与任务详情共用流程信息面板：历史行转换为统一审批历史形状。 */
const approvalHistory = computed<ApprovalHistoryItem[]>(() => {
  const rows = detail.value?.history ?? []
  return rows.map((row, index) => {
    const nodeKey = typeof row.nodeKey === 'string' ? row.nodeKey : ''
    const action = String(row.action ?? '')
    const settlement = String(row.settlementStatus ?? '')
    const result =
      settlement === 'APPROVED' || action === 'APPROVE'
        ? 'APPROVED'
        : settlement === 'REJECTED' || action === 'REJECT' || action === 'DISAPPROVE'
          ? 'REJECTED'
          : null
    const taskName = String(row.taskName || nodeName(detailProcessKey.value, nodeKey) || '审批记录')
    const rawAssignee = String(row.assigneeName ?? row.assignee ?? '').trim()
    return {
      taskId: String(row.taskId ?? `cc-history-${index}`),
      taskName,
      nodeKey: nodeKey || null,
      assignee: String(row.assignee ?? ''),
      assigneeName: /[\u4e00-\u9fa5]/.test(rawAssignee) ? rawAssignee : '审批人',
      assigneeDept: row.assigneeDept ? String(row.assigneeDept) : null,
      createTime: String(row.createTime ?? ''),
      endTime: row.endTime ? String(row.endTime) : row.createTime ? String(row.createTime) : null,
      action: action === 'APPROVE' || action === 'REJECT' || action === 'RETURN' ? action : null,
      opinionData:
        row.opinionData && typeof row.opinionData === 'object'
          ? (row.opinionData as Record<string, unknown>)
          : typeof row.comment === 'string' && row.comment
            ? { comment: row.comment }
            : null,
      approvalResult: result,
    }
  })
})

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
    <template #filter>
      <ListFilterItem :label="t('workflow.ccTime')">
        <el-date-picker
          v-model="filter.timeRange"
          type="datetimerange"
          :range-separator="t('common.to')"
          :start-placeholder="t('common.startTime')"
          :end-placeholder="t('common.endTime')"
        />
      </ListFilterItem>
      <ListFilterItem label="流程实例编号">
        <el-input
          v-model="filter.processInstanceId"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleSearch"
        />
      </ListFilterItem>
      <ListFilterItem :label="t('common.keyword')">
        <el-input
          v-model="filter.keyword"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleSearch"
        />
      </ListFilterItem>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleSearch">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>
    <template #empty-action>
      <span />
    </template>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <el-table v-loading="loading" :data="list" stripe style="width: 100%">
      <el-table-column :label="t('common.formName')" min-width="160">
        <template #default="{ row }">{{ formName(row.formKey) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.processName')" min-width="160">
        <template #default="{ row }">{{ processName(row.processDefKey) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.businessNo')" min-width="160">
        <template #default="{ row }">{{ row.businessKey || '-' }}</template>
      </el-table-column>
      <el-table-column :label="t('workflow.ccNode')" min-width="130">
        <template #default="{ row }">{{ nodeName(row.processDefKey, row.nodeKey) }}</template>
      </el-table-column>
      <el-table-column :label="t('workflow.instanceStatus')" width="110">
        <template #default="{ row }">
          {{ enumLabel('WORKFLOW_INSTANCE', row.instanceStatus ?? '') || '-' }}
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.deliveryStatus')" width="110">
        <template #default="{ row }">
          {{ enumLabel('NOTIFY_DELIVERY', row.deliveryStatus ?? '') || '-' }}
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.ccTime')" min-width="170">
        <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="90" />
    </el-table>
  </StandardListTemplate>

  <BusinessDetailDialog
    v-model="detailVisible"
    :title="t('workflow.ccDetailTitle')"
    :form-key="detailFormKey"
    :record="detailFormData"
    :approval-history="approvalHistory"
    :process-definition-key="detailProcessKey"
    :current-node-key="detailNodeKey"
  />
</template>

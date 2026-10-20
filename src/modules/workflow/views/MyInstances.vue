<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * MyInstances — 我发起的流程列表页（页型 B）。
 *
 * 状态筛选 + 关键字搜索 + 真分页；行操作「详情」弹窗展示
 * 实例信息、当前进度与流转记录（审批历史）。
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ListActionsColumn, ListFilterItem, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { myInstances, myInstanceDetail, withdrawInstance } from '@/modules/workflow/api'
import { urgeMyInstance } from '@/modules/workflow/api/oa'
import type { ProcessInstance, MyInstanceDetail } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import BusinessDetailDialog from '@/components/business-detail/BusinessDetailDialog.vue'

const router = useRouter()

// ─── 列表状态 ───
const list = ref<ProcessInstance[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')
const dateRange = ref<[string, string] | null>(null)

const filter = reactive<{ status: string; keyword: string }>({ status: '', keyword: '' })

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

const STATUS_TAG: Record<
  string,
  { label: string; type: 'primary' | 'warning' | 'success' | 'danger' | 'info' }
> = {
  RUNNING: {
    get label() {
      return t('common.statusInProgress')
    },
    type: 'primary',
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
  WITHDRAWN: {
    get label() {
      return t('common.statusWithdrawn')
    },
    type: 'warning',
  },
  DISCARDED: {
    get label() {
      return t('workflow.statusDiscarded')
    },
    type: 'info',
  },
}

/** I3 §4.7：发起人撤回（尚未越过不可撤回边界时可用；重复请求幂等）。 */
const withdrawingId = ref<string | null>(null)

function asInstance(row: unknown): ProcessInstance {
  return row as ProcessInstance
}

async function withdrawRow(rowRaw: unknown) {
  const row = asInstance(rowRaw)
  try {
    await ElMessageBox.confirm(
      t('workflow.withdrawConfirmMessage'),
      t('workflow.withdrawConfirmTitle'),
      {
        get confirmButtonText() {
          return t('common.withdraw')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        type: 'warning',
      },
    )
  } catch {
    return
  }
  withdrawingId.value = row.processInstanceId
  try {
    await withdrawInstance(row.processInstanceId, { reason: '发起人撤回' })
    ElMessage.success(t('common.statusWithdrawn'))
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.withdrawFailed'))
  } finally {
    withdrawingId.value = null
  }
}

function statusLabel(status: string): string {
  return STATUS_TAG[status]?.label ?? status
}

function statusTagType(status: string): 'primary' | 'warning' | 'success' | 'danger' | 'info' {
  return STATUS_TAG[status]?.type ?? 'info'
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await myInstances(pageQuery, {
      status: filter.status || undefined,
      keyword: filter.keyword.trim() || undefined,
      timeFrom: dateRange.value?.[0] ? `${dateRange.value[0]} 00:00:00` : undefined,
      timeTo: dateRange.value?.[1] ? `${dateRange.value[1]} 23:59:59` : undefined,
    })
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('workflow.startedByMeLoadFailed')
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
  filter.status = ''
  filter.keyword = ''
  dateRange.value = null
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

/** 展示层时间格式：真实时间戳 → MM-DD HH:mm（设计02列宽内的显示格式，仅显示不改数据） */
function formatTime(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return value.replace('T', ' ').slice(0, 16)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

// ─── 详情弹窗 ───
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<MyInstanceDetail | null>(null)

async function openDetail(row: ProcessInstance) {
  detailLoading.value = true
  try {
    detail.value = await myInstanceDetail(row.id)
    detailVisible.value = true
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.instanceDetailLoadFailed'))
  } finally {
    detailLoading.value = false
  }
}

// ─── 催办（v0.0.2：发起人对运行中实例催办当前待办人；10 分钟冷却） ───
const urgingId = ref<number | null>(null)

async function urge(row: ProcessInstance) {
  urgingId.value = row.id
  try {
    const resp = await urgeMyInstance(row.id)
    if (resp.result === 'ACCEPTED') {
      ElMessage.success(resp.detail || t('workflow.urgeSent'))
    } else if (resp.result === 'COOLDOWN') {
      ElMessage.warning(resp.detail || t('workflow.urgeCoolingDown'))
    } else {
      ElMessage.info(resp.detail || t('workflow.urgeNotAvailable'))
    }
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.urgeFailed'))
  } finally {
    urgingId.value = null
  }
}

/**
 * 操作列（V012-BUG-002）：详情直显；催办/撤回仅 RUNNING 且有对应权限时可见
 * （原 v-if + v-perm 显隐转为 visible 表达式，服务端仍是最终权威）。
 */
function rowActions(row: unknown): ListAction[] {
  const item = asInstance(row)
  return [
    {
      key: 'detail',
      label: t('common.viewDetails'),
      onClick: () => void openDetail(item),
    },
    {
      key: 'urge',
      label: t('workflow.urge'),
      type: 'warning',
      visible: item.status === 'RUNNING' && hasPerm('workflow:urge'),
      disabled: urgingId.value === item.id,
      onClick: () => void urge(item),
    },
    {
      key: 'withdraw',
      label: t('common.withdraw'),
      type: 'danger',
      visible: item.status === 'RUNNING' && hasPerm('workflow:task:withdraw'),
      disabled: withdrawingId.value === item.processInstanceId,
      onClick: () => void withdrawRow(item),
    },
  ]
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :show-toolbar-total="false"
    large
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 筛选区（关键字、状态、发起时间均进入列表查询参数） -->
    <template #filter>
      <ListFilterItem :label="t('workflow.filterKeywordLabel')">
        <el-input
          v-model="filter.keyword"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleSearch"
        />
      </ListFilterItem>
      <ListFilterItem :label="t('common.status')">
        <el-select
          v-model="filter.status"
          :placeholder="t('common.all')"
          clearable
          @change="handleSearch"
        >
          <el-option :label="t('common.statusInProgress')" value="RUNNING" />
          <el-option :label="t('common.statusApproved')" value="APPROVED" />
          <el-option :label="t('common.statusRejected')" value="REJECTED" />
        </el-select>
      </ListFilterItem>
      <ListFilterItem :label="t('common.startTimeShort')">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          :start-placeholder="t('common.startTimeShort')"
          :end-placeholder="t('common.endTime')"
          range-separator="—"
        />
      </ListFilterItem>
    </template>

    <template #filter-actions>
      <el-button type="primary" @click="handleSearch">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <template #table-title>
      <h3 class="my-instances-panel-title">{{ t('common.processApplyTitle') }}</h3>
      <el-button
        class="my-instances-panel-create"
        type="primary"
        @click="router.push('/workflow/catalog')"
      >
        ＋ {{ t('common.create') }}
      </el-button>
    </template>

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
      style="width: 100%"
      class="my-instances-table"
    >
      <el-table-column :label="t('common.processName')" min-width="260">
        <template #default="{ row }">
          {{ row.processName ?? '-' }}
        </template>
      </el-table-column>
      <!-- BF20261013-044：流程编号列展示发起时按编号规则生成的实例编号（主题），
           不再错绑业务标识（businessKey 仍在详情弹窗以「业务单号」展示） -->
      <el-table-column :label="t('common.processNo')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.theme || '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.currentNode')" min-width="160">
        <template #default="{ row }">
          {{ row.currentNode ?? t('common.dash') }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" min-width="120">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createTime" :label="t('common.startTimeShort')" min-width="200">
        <template #default="{ row }">
          {{ formatTime(row.createTime) }}
        </template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="150" />
    </el-table>

    <!-- 详情弹窗 -->
  </StandardListTemplate>
  <BusinessDetailDialog
    v-model="detailVisible"
    :title="t('workflow.instanceDetail')"
    :form-key="detail?.formKey ?? ''"
    :record-id="detail?.businessKey ?? ''"
    :approval-history="detail?.history ?? []"
    :process-definition-key="detail?.instance.processDefKey ?? ''"
    :current-node-key="detail?.progress?.[0]?.nodeKey ?? ''"
  />
</template>

<style scoped>
.detail-section-title {
  margin: 16px 0 8px;
  color: var(--sw-color-primary);
  font-size: 13px;
  font-weight: 600;
}
/* P64 阶段Ⅰ：触发与动作回查 */
.p64-subtitle {
  margin: 8px 0 4px;
  font-size: 12px;
  color: var(--sw-color-primary);
  font-weight: 600;
}
.p64-cell-note {
  margin-left: 6px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
}
.p64-table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.my-instances-panel-title {
  margin: 0;
  font-size: 17px;
  line-height: 28px;
  font-weight: 600;
  color: var(--sw-text-primary);
  transform: translateY(-7px);
}
.standard-list :deep(.list-toolbar__title--large) {
  font-size: 26px;
  line-height: 28px;
}
.standard-list :deep(.standard-list__panel-head) {
  padding: 0 24px;
}
.my-instances-panel-create {
  position: relative;
  width: 86px;
  height: 38px;
  transform: translateY(-8px);
}
.my-instances-panel-create :deep(span) {
  position: absolute;
  inset: 0;
  display: block;
  width: 86px;
  line-height: 38px;
  /* BF20261013-046：按钮文字居中（原 fixture 左对齐，＋ 新建 贴按钮左缘） */
  text-align: center;
}

.my-instances-table :deep(th.el-table__cell),
.my-instances-table :deep(td.el-table__cell) {
  padding-left: 32px;
  padding-right: 0;
}
.my-instances-table :deep(th.el-table_1_column_6),
.my-instances-table :deep(td.el-table_1_column_6) {
  padding-left: 32px;
}
.my-instances-table :deep(th.el-table_1_column_4),
.my-instances-table :deep(td.el-table_1_column_4) {
  padding-left: 24px;
}
.my-instances-table :deep(th.el-table_1_column_6),
.my-instances-table :deep(td.el-table_1_column_6) {
  padding-left: 26px;
}
.my-instances-table :deep(.el-tag) {
  width: 72px;
  height: 28px;
  padding: 0;
  line-height: 28px;
}
.my-instances-table :deep(.el-tag__content) {
  display: block;
  width: 72px;
  line-height: 28px;
  /* BF20261013-046：状态徽标文字居中（原定宽 72px + 左对齐，文字贴左） */
  text-align: center;
}
</style>

<style scoped>
/* 设计（节点02）：表格行距 68px（设计行 538→606→674 实测）、表头 44px。
   td 显式定高：RUNNING 行的催办/撤回真实操作链接不得换行撑高行（列宽已放宽单行容纳）。 */
.my-instances-table :deep(td.el-table__cell) {
  height: 67px;
  padding: 4px 0 4px 32px;
}
.my-instances-table :deep(th.el-table__cell) {
  height: 32px;
  padding-left: 32px;
  padding-right: 0;
}
.my-instances-table :deep(th.el-table_1_column_6.el-table__cell),
.my-instances-table :deep(td.el-table_1_column_6.el-table__cell) {
  padding-left: 26px;
}
.my-instances-table :deep(th.el-table_1_column_6.el-table__cell) {
  padding-left: 32px;
}
.my-instances-table :deep(.el-table__header-wrapper tr),
.my-instances-table :deep(.el-table__header-wrapper th) {
  height: 32px !important;
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}
.my-instances-table :deep(.el-table__header-wrapper .cell) {
  position: relative;
  top: 6px;
}
</style>

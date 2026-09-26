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
import { ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { myInstances, myInstanceDetail, withdrawInstance } from '@/modules/workflow/api'
import { urgeMyInstance } from '@/modules/workflow/api/oa'
import type { ProcessInstance, MyInstanceDetail } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'

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
const detailError = ref('')

async function openDetail(row: ProcessInstance) {
  detailVisible.value = true
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  try {
    detail.value = await myInstanceDetail(row.id)
  } catch (err) {
    detailError.value = err instanceof ApiError ? err.msg : t('workflow.instanceDetailLoadFailed')
  } finally {
    detailLoading.value = false
  }
}

// ─── 流转记录映射 ───
const APPROVAL_RESULT_MAP: Record<string, { label: string; type: 'success' | 'danger' | 'info' }> =
  {
    APPROVED: {
      get label() {
        return t('common.approve')
      },
      type: 'success',
    },
    REJECTED: {
      get label() {
        return t('common.reject')
      },
      type: 'danger',
    },
    RETURNED: {
      get label() {
        return t('common.statusReturned')
      },
      type: 'info',
    },
  }

// 动作标签（对齐 MyProcessed 的 ACTION_TAG 口径）
const ACTION_LABEL_MAP: Record<string, string> = {
  get APPROVE() {
    return t('common.approve')
  },
  get REJECT() {
    return t('common.reject')
  },
  get RETURN() {
    return t('common.returnBack')
  },
}

function actionLabel(action: string | null): string {
  if (!action) return '-'
  return ACTION_LABEL_MAP[action] ?? action
}

function resultLabel(result: string | null): string {
  if (!result) return t('common.statusInProgress')
  return APPROVAL_RESULT_MAP[result]?.label ?? result
}

function resultTagType(result: string | null): 'success' | 'danger' | 'info' {
  if (!result) return 'info'
  return APPROVAL_RESULT_MAP[result]?.type ?? 'info'
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
    :title="t('common.myInstancesPageTitle')"
    :description="t('workflow.myInstancesDescription')"
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
      <div class="my-instances-field">
        <span class="my-instances-field__label">{{ t('workflow.filterKeywordLabel') }}</span>
        <el-input
          v-model="filter.keyword"
          :placeholder="t('workflow.searchProcessPlaceholder')"
          clearable
          style="width: 250px"
          @keyup.enter="handleSearch"
        />
      </div>
      <div class="my-instances-field">
        <span class="my-instances-field__label">{{ t('common.status') }}</span>
        <el-select
          v-model="filter.status"
          :placeholder="t('common.all')"
          clearable
          style="width: 130px"
          @change="handleSearch"
        >
          <el-option :label="t('common.statusInProgress')" value="RUNNING" />
          <el-option :label="t('common.statusApproved')" value="APPROVED" />
          <el-option :label="t('common.statusRejected')" value="REJECTED" />
        </el-select>
      </div>
      <div class="my-instances-field">
        <span class="my-instances-field__label">{{ t('common.startTimeShort') }}</span>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          :start-placeholder="t('common.startTimeShort')"
          :end-placeholder="t('common.endTime')"
          range-separator="—"
          style="width: 220px"
        />
      </div>
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
      <el-table-column
        prop="businessKey"
        :label="t('common.processNo')"
        min-width="200"
        show-overflow-tooltip
      />
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
  <el-dialog v-model="detailVisible" :title="t('workflow.instanceDetail')" width="760px">
    <div v-loading="detailLoading">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon />
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item :label="t('common.processName')">
            {{ detail.processName ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.status')">
            <el-tag :type="statusTagType(detail.status)" size="small">
              {{ statusLabel(detail.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.processKey')">
            {{ detail.instance.processDefKey }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.businessNo')">{{
            detail.businessKey
          }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.formKey')">{{
            detail.formKey
          }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.startTimeShort')">
            {{ detail.instance.createTime }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 当前进度 -->
        <h4 class="detail-section-title">{{ t('workflow.currentProgress') }}</h4>
        <el-alert
          v-if="detail.progress.length === 0"
          :title="t('workflow.flowEndedNoActiveNode')"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table v-else :data="detail.progress" stripe size="small">
          <el-table-column prop="taskName" :label="t('common.node')" min-width="140" />
          <el-table-column prop="nodeKey" :label="t('workflow.nodeKey')" min-width="140" />
          <el-table-column prop="assignee" :label="t('workflow.assignee')" min-width="120" />
          <el-table-column :label="t('common.taskNo')" min-width="140">
            <template #default="{ row }">
              {{ row.taskId }}
            </template>
          </el-table-column>
        </el-table>

        <!-- 流转记录 -->
        <h4 class="detail-section-title">{{ t('common.flowHistory') }}</h4>
        <el-alert
          v-if="detail.history.length === 0"
          :title="t('workflow.noFlowRecords')"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table v-else :data="detail.history" stripe size="small">
          <el-table-column prop="taskName" :label="t('common.node')" min-width="120" />
          <el-table-column :label="t('workflow.assignee')" min-width="110">
            <template #default="{ row }">
              {{ row.assigneeName ?? row.assignee ?? '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.action')" width="90">
            <template #default="{ row }">
              {{ actionLabel(row.action) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.result')" width="90">
            <template #default="{ row }">
              <el-tag :type="resultTagType(row.approvalResult)" size="small">
                {{ resultLabel(row.approvalResult) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.comment')" min-width="150">
            <template #default="{ row }">
              {{ row.opinionData?.comment ?? '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="createTime" :label="t('workflow.arrivedAt')" min-width="160" />
          <el-table-column :label="t('workflow.handledAt')" min-width="160">
            <template #default="{ row }">
              {{ row.endTime ?? '-' }}
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>
    <template #footer>
      <el-button @click="detailVisible = false">{{ t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.detail-section-title {
  margin: 16px 0 8px;
  color: var(--sw-color-primary);
  font-size: 13px;
  font-weight: 600;
}
.my-instances-panel-title {
  margin: 0;
  font-size: 17px;
  line-height: 28px;
  font-weight: 600;
  color: var(--sw-text-primary);
  transform: translateY(-7px);
}
.my-instances-field {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.standard-list :deep(.list-filter-bar__fields) {
  /* 不再写死 784px：宽屏下三列按比例吃掉整行剩余宽度（窄屏回落到各自 min，不挤压） */
  /* flex-basis 取原固定宽度：空间不足时先收缩字段块，按钮不会被挤到第二行 */
  flex: 1 1 784px;
  /* 与按钮组的间距由字段侧给：按钮组用 margin-left:auto 才能在被换到第二行时靠右 */
  margin-right: 18px;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1.6fr) minmax(140px, 1fr) minmax(220px, 1.4fr);
  column-gap: 64px;
  row-gap: 0;
  align-items: start;
  transform: translateY(3px);
}
.standard-list :deep(.list-filter-bar__actions) {
  margin-left: auto;
  padding-top: 24px;
  gap: 12px;
  transform: translateY(5px);
  /* 不参与换行收缩，保证与字段块同行 */
  flex: 0 0 auto;
}
.standard-list :deep(.list-filter-bar__actions .el-button) {
  width: 86px;
  height: 42px;
  margin-left: 0;
}
.my-instances-field > :deep(.el-input),
.my-instances-field > :deep(.el-select),
.my-instances-field > :deep(.el-date-editor) {
  margin-left: 16px;
  width: 220px !important;
  height: 42px;
}
.my-instances-field > :deep(.el-input),
.my-instances-field > :deep(.el-select) {
  height: 42px;
}
.my-instances-field:nth-child(1) > :deep(.el-input) {
  width: 250px !important;
}
.my-instances-field:nth-child(2) > :deep(.el-select) {
  width: 130px !important;
}
.my-instances-field__label {
  line-height: 17px;
}
.my-instances-field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--sw-text-regular);
}

.standard-list :deep(.list-toolbar__title--large) {
  font-size: 26px;
  line-height: 28px;
}
.standard-list :deep(.list-filter-bar) {
  min-height: 165px;
  box-sizing: border-box;
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
  text-align: left;
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

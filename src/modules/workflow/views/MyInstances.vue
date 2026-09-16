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
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import { myInstances, myInstanceDetail, withdrawInstance } from '@/modules/workflow/api'
import { urgeMyInstance } from '@/modules/workflow/api/oa'
import type { ProcessInstance, MyInstanceDetail } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

// ─── 列表状态 ───
const list = ref<ProcessInstance[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<{ status: string; keyword: string }>({ status: '', keyword: '' })

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

const STATUS_TAG: Record<
  string,
  { label: string; type: 'warning' | 'success' | 'danger' | 'info' }
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

function statusTagType(status: string): 'warning' | 'success' | 'danger' | 'info' {
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

function urgeRow(r: unknown) {
  void urge(r as ProcessInstance)
}

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

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数（对齐 TodoList 写法）
function openDetailRow(r: unknown) {
  void openDetail(r as ProcessInstance)
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('common.startedByMe')"
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
        v-model="filter.status"
        :placeholder="t('common.status')"
        clearable
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option :label="t('common.statusInProgress')" value="RUNNING" />
        <el-option :label="t('common.statusApproved')" value="APPROVED" />
        <el-option :label="t('common.statusRejected')" value="REJECTED" />
      </el-select>
      <el-input
        v-model="filter.keyword"
        :placeholder="t('workflow.searchProcessPlaceholder')"
        clearable
        style="width: 200px"
        @keyup.enter="handleSearch"
      />
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
      <el-table-column :label="t('common.processName')" min-width="150">
        <template #default="{ row }">
          {{ row.processName ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="processDefKey" :label="t('common.processKey')" min-width="150" />
      <el-table-column prop="businessKey" :label="t('common.businessNo')" min-width="120" />
      <el-table-column prop="formKey" :label="t('common.formKey')" min-width="130" />
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createTime" :label="t('common.startTimeShort')" min-width="170" />
      <el-table-column :label="t('common.actions')" width="190" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openDetailRow(row)">{{
            t('common.detail')
          }}</el-button>
          <el-button
            v-if="row.status === 'RUNNING'"
            v-perm="'workflow:urge'"
            size="small"
            type="warning"
            link
            :disabled="urgingId === row.id"
            @click="urgeRow(row)"
          >
            {{ t('workflow.urge') }}
          </el-button>
          <el-button
            v-if="row.status === 'RUNNING'"
            v-perm="'workflow:task:withdraw'"
            size="small"
            type="danger"
            link
            :disabled="withdrawingId === row.processInstanceId"
            @click="withdrawRow(row)"
          >
            {{ t('common.withdraw') }}
          </el-button>
        </template>
      </el-table-column>
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
</style>

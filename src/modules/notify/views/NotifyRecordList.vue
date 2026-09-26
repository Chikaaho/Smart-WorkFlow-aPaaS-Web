<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * NotifyRecordList — 通知发送记录（v0.0.2 P3，有权管理者）。
 *
 * 发送记录分页（状态/关键字/时间窗筛选）+ 单条关联日志（各次尝试流水）
 * + 失败重发（服务端并发单受理，仅明确失败且无进行中重发的记录可重发）。
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  queryNotifyRecords,
  queryNotifyRecordDetail,
  resendNotifyRecord,
  type NotifyRecord,
  type NotifyRecordDetail,
} from '@/modules/notify/api/records'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

const list = ref<NotifyRecord[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<{
  deliveryStatus: string
  keyword: string
  timeRange: [string, string] | null
}>({
  deliveryStatus: '',
  keyword: '',
  timeRange: null,
})

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

const STATUS_TAG: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  SUCCESS: 'success',
  FAILED: 'danger',
  RESENDING: 'warning',
  PENDING: 'info',
  TIMEOUT: 'warning',
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await queryNotifyRecords(pageQuery, {
      deliveryStatus: filter.deliveryStatus || undefined,
      keyword: filter.keyword.trim() || undefined,
      timeFrom: filter.timeRange?.[0],
      timeTo: filter.timeRange?.[1],
    })
    list.value = result.list
    total.value = result.total
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('notify.recordListLoadFailed')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.deliveryStatus = ''
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

// ─── 详情（关联日志） ───
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<NotifyRecordDetail | null>(null)
const detailError = ref('')

async function openDetail(row: NotifyRecord) {
  detailVisible.value = true
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  try {
    detail.value = await queryNotifyRecordDetail(row.id)
  } catch (err) {
    detailError.value = err instanceof ApiError ? err.msg : t('notify.recordDetailLoadFailed')
  } finally {
    detailLoading.value = false
  }
}

// ─── 失败重发 ───
const resendingId = ref<number | null>(null)

async function resend(row: NotifyRecord) {
  resendingId.value = row.id
  try {
    const status = await resendNotifyRecord(row.id)
    if (status === 'SUCCESS') {
      ElMessage.success(t('notify.resendSucceeded'))
    } else {
      ElMessage.warning(t('notify.resendResult', { status }))
    }
    detailVisible.value = false
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('notify.resendFailed'))
  } finally {
    resendingId.value = null
  }
}

/** 统一操作列（V012-BUG-002）：查看日志直显；重发仅失败记录可用（服务端仍会校验并发与状态） */
function rowActions(r: unknown): ListAction[] {
  const row = r as NotifyRecord
  return [
    {
      key: 'log',
      label: t('notify.logButton'),
      onClick: () => openDetail(row),
    },
    {
      key: 'resend',
      label: t('notify.resend'),
      type: 'warning',
      disabled: row.deliveryStatus !== 'FAILED' || resendingId.value === row.id,
      onClick: () => resend(row),
    },
  ]
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('notify.recordListTitle')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <el-select
        v-model="filter.deliveryStatus"
        :placeholder="t('common.status')"
        clearable
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option :label="t('common.resultSuccess')" value="SUCCESS" />
        <el-option :label="t('common.resultFailed')" value="FAILED" />
        <el-option :label="t('notify.statusResending')" value="RESENDING" />
        <el-option :label="t('notify.statusTimeout')" value="TIMEOUT" />
      </el-select>
      <el-date-picker
        v-model="filter.timeRange"
        type="datetimerange"
        :range-separator="t('common.to')"
        :start-placeholder="t('common.startTime')"
        :end-placeholder="t('common.endTime')"
        style="width: 340px"
      />
      <el-input
        v-model="filter.keyword"
        :placeholder="t('notify.recordSearchPlaceholder')"
        clearable
        style="width: 200px"
        @keyup.enter="handleSearch"
      />
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
      <el-table-column prop="id" :label="t('notify.recordId')" width="90" />
      <el-table-column prop="recipientId" :label="t('notify.recipient')" width="100" />
      <el-table-column
        prop="title"
        :label="t('common.title')"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column prop="bizType" :label="t('notify.bizType')" width="110" />
      <el-table-column prop="channel" :label="t('common.channel')" width="100" />
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.deliveryStatus] ?? 'info'" size="small">
            {{ enumLabel('NOTIFY_DELIVERY', row.deliveryStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="failureReason"
        :label="t('common.failureReason')"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column prop="createTime" :label="t('common.time')" min-width="170" />
      <ListActionsColumn :actions="rowActions" :width="120" />
    </el-table>
  </StandardListTemplate>

  <el-dialog v-model="detailVisible" :title="t('notify.sendLogTitle')" width="720px">
    <div v-loading="detailLoading">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon />
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item :label="t('notify.recordId')">{{
            detail.message.id
          }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.status')">
            <el-tag :type="STATUS_TAG[detail.message.deliveryStatus] ?? 'info'" size="small">
              {{ enumLabel('NOTIFY_DELIVERY', detail.message.deliveryStatus) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="t('notify.recipient')">{{
            detail.message.recipientId
          }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.channel')">{{
            detail.message.channel ?? '-'
          }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.title')" :span="2">{{
            detail.message.title
          }}</el-descriptions-item>
          <el-descriptions-item :label="t('common.failureReason')" :span="2">
            {{ detail.message.failureReason ?? '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="log-section-title">{{ t('notify.deliveryAttempts') }}</h4>
        <el-alert
          v-if="detail.attempts.length === 0"
          :title="t('notify.noAttempts')"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table v-else :data="detail.attempts" stripe size="small">
          <el-table-column prop="attemptNo" label="#" width="60" />
          <el-table-column prop="status" :label="t('common.result')" width="90" />
          <el-table-column
            prop="failureReason"
            :label="t('common.failureReason')"
            min-width="200"
          />
          <el-table-column prop="createTime" :label="t('common.time')" min-width="170" />
        </el-table>
      </template>
    </div>
    <template #footer>
      <el-button @click="detailVisible = false">{{ t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.log-section-title {
  margin: 16px 0 8px;
  color: var(--sw-color-primary);
  font-size: 13px;
  font-weight: 600;
}
</style>

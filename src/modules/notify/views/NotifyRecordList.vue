<script setup lang="ts">
/**
 * NotifyRecordList — 通知发送记录（v0.0.2 P3，有权管理者）。
 *
 * 发送记录分页（状态/关键字/时间窗筛选）+ 单条关联日志（各次尝试流水）
 * + 失败重发（服务端并发单受理，仅明确失败且无进行中重发的记录可重发）。
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
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
    errorMsg.value = err instanceof ApiError ? err.msg : '加载发送记录失败'
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
    detailError.value = err instanceof ApiError ? err.msg : '加载记录详情失败'
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
      ElMessage.success('重发成功')
    } else {
      ElMessage.warning(`重发结果：${status}`)
    }
    detailVisible.value = false
    await loadList()
  } catch (err) {
    ElMessage.error(
      err instanceof ApiError ? err.msg : '重发失败（仅明确失败且无进行中重发的记录可重发）',
    )
  } finally {
    resendingId.value = null
  }
}

function openDetailRow(r: unknown) {
  void openDetail(r as NotifyRecord)
}

/* el-table row slot 的 DefaultRow 类型桥接（对齐 MyInstances 写法） */
function resendRow(r: unknown) {
  void resend(r as NotifyRecord)
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="通知发送记录"
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
        placeholder="状态"
        clearable
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option label="成功" value="SUCCESS" />
        <el-option label="失败" value="FAILED" />
        <el-option label="重发中" value="RESENDING" />
        <el-option label="超时" value="TIMEOUT" />
      </el-select>
      <el-date-picker
        v-model="filter.timeRange"
        type="datetimerange"
        range-separator="至"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        style="width: 340px"
      />
      <el-input
        v-model="filter.keyword"
        placeholder="标题/内容/业务ID"
        clearable
        style="width: 200px"
        @keyup.enter="handleSearch"
      />
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleSearch">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
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
      <el-table-column prop="id" label="记录ID" width="90" />
      <el-table-column prop="recipientId" label="接收人" width="100" />
      <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
      <el-table-column prop="bizType" label="业务类型" width="110" />
      <el-table-column prop="channel" label="渠道" width="100" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.deliveryStatus] ?? 'info'" size="small">
            {{ row.deliveryStatus }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="failureReason"
        label="失败原因"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column prop="createTime" label="时间" min-width="170" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openDetailRow(row)">日志</el-button>
          <el-button
            size="small"
            type="warning"
            link
            :disabled="row.deliveryStatus !== 'FAILED' || resendingId === row.id"
            @click="resendRow(row)"
          >
            重发
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>

  <el-dialog v-model="detailVisible" title="发送日志" width="720px">
    <div v-loading="detailLoading">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon />
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="记录ID">{{ detail.message.id }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="STATUS_TAG[detail.message.deliveryStatus] ?? 'info'" size="small">
              {{ detail.message.deliveryStatus }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="接收人">{{
            detail.message.recipientId
          }}</el-descriptions-item>
          <el-descriptions-item label="渠道">{{
            detail.message.channel ?? '-'
          }}</el-descriptions-item>
          <el-descriptions-item label="标题" :span="2">{{
            detail.message.title
          }}</el-descriptions-item>
          <el-descriptions-item label="失败原因" :span="2">
            {{ detail.message.failureReason ?? '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="log-section-title">投递尝试（含原始失败与最新结果）</h4>
        <el-alert
          v-if="detail.attempts.length === 0"
          title="无尝试流水"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table v-else :data="detail.attempts" stripe size="small">
          <el-table-column prop="attemptNo" label="#" width="60" />
          <el-table-column prop="status" label="结果" width="90" />
          <el-table-column prop="failureReason" label="失败原因" min-width="200" />
          <el-table-column prop="createTime" label="时间" min-width="170" />
        </el-table>
      </template>
    </div>
    <template #footer>
      <el-button @click="detailVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.log-section-title {
  margin: 16px 0 8px;
  color: var(--sw-color-primary, #7e306b);
  font-size: 13px;
  font-weight: 600;
}
</style>

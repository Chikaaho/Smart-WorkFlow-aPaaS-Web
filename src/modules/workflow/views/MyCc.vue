<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * MyCc — 抄送我的（v0.0.2 OA 个人办理，页型 B）。
 *
 * 仅本人收到的抄送（服务端强制 recipient=当前用户），关键字 + 时间窗过滤，
 * 稳定分页；行操作「详情」弹窗展示抄送/实例信息、只读表单快照与审批进度/意见。
 * 抄送身份不含审批操作权（无同意/驳回入口）。
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  queryMyCopies,
  queryMyCopyDetail,
  type MyCopyItem,
  type MyCopyDetail,
} from '@/modules/workflow/api/oa'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

const list = ref<MyCopyItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

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
const detailError = ref('')

async function openDetail(row: MyCopyItem) {
  detailVisible.value = true
  detailLoading.value = true
  detailError.value = ''
  detail.value = null
  try {
    detail.value = await queryMyCopyDetail(row.id)
  } catch (err) {
    detailError.value = err instanceof ApiError ? err.msg : t('workflow.ccDetailLoadFailed')
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

const detailFormData = computed<Record<string, unknown>>(() => {
  const raw = detail.value?.formData
  return raw ? (raw as Record<string, unknown>) : {}
})

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('router.myCc')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <el-date-picker
        v-model="filter.timeRange"
        type="datetimerange"
        :range-separator="t('common.to')"
        :start-placeholder="t('common.startTime')"
        :end-placeholder="t('common.endTime')"
        style="width: 340px"
      />
      <el-input
        v-model="filter.processInstanceId"
        :placeholder="t('workflow.instanceIdExactPlaceholder')"
        clearable
        style="width: 260px"
        @keyup.enter="handleSearch"
      />
      <el-input
        v-model="filter.keyword"
        :placeholder="t('workflow.ccKeywordPlaceholder')"
        clearable
        style="width: 220px"
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
      <el-table-column prop="formKey" :label="t('common.formKey')" min-width="140" />
      <el-table-column prop="processDefKey" :label="t('common.processKey')" min-width="150" />
      <el-table-column prop="businessKey" :label="t('common.businessNo')" min-width="130" />
      <el-table-column prop="nodeKey" :label="t('workflow.ccNode')" min-width="120" />
      <el-table-column :label="t('workflow.instanceStatus')" width="100">
        <template #default="{ row }">
          {{ enumLabel('WORKFLOW_INSTANCE', row.instanceStatus ?? '-') }}
        </template>
      </el-table-column>
      <el-table-column prop="deliveryStatus" :label="t('workflow.deliveryStatus')" width="100" />
      <el-table-column prop="createTime" :label="t('workflow.ccTime')" min-width="170" />
      <ListActionsColumn :actions="rowActions" :width="90" />
    </el-table>
  </StandardListTemplate>

  <el-dialog v-model="detailVisible" :title="t('workflow.ccDetailTitle')" width="760px">
    <div v-loading="detailLoading">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon />
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item :label="t('common.processKey')">
            {{ detailInstance?.processDefKey ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.instanceStatus')">
            {{ detailInstance?.status ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.businessNo')">
            {{ detailInstance?.businessKey ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('workflow.ccNode')">
            {{ detailCopy.nodeKey ?? '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="detail-section-title">{{ t('workflow.formDataReadonlySnapshot') }}</h4>
        <el-alert
          v-if="Object.keys(detailFormData).length === 0"
          :title="t('workflow.noFormData')"
          type="info"
          :closable="false"
          show-icon
        />
        <el-descriptions v-else :column="1" border size="small">
          <el-descriptions-item
            v-for="(value, key) in detailFormData"
            :key="key"
            :label="String(key)"
          >
            {{ typeof value === 'object' ? JSON.stringify(value) : String(value) }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="detail-section-title">{{ t('workflow.approvalProgress') }}</h4>
        <el-alert
          v-if="detail.progress.length === 0"
          :title="t('workflow.flowEndedNoActiveNode')"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table v-else :data="detail.progress" stripe size="small">
          <el-table-column prop="name" :label="t('common.node')" min-width="140" />
          <el-table-column prop="assignee" :label="t('workflow.assignee')" min-width="120" />
        </el-table>

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
          <el-table-column prop="action" :label="t('common.action')" width="90" />
          <el-table-column prop="settlementStatus" :label="t('common.result')" width="90" />
          <el-table-column prop="createTime" :label="t('workflow.arrivedAt')" min-width="160" />
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

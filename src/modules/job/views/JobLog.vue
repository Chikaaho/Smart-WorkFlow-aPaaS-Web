<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * JobLog — 定时任务执行日志查看页（页型 B，只读）。
 *
 * 按任务 ID（从 route.query.jobId 获取）分页展示执行日志。
 * 提供状态筛选、执行详情弹窗（含 el-descriptions）。
 * 无 CRUD 操作，纯只读视图。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/foundation/request'
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { pageJobLogs } from '@/modules/job/api'
import type { JobLog, ExecStatus, TriggerType } from '@/contracts/job'

// ─── 路由参数 ───

const route = useRoute()
const routeJobId = computed(() => {
  const raw = route.query.jobId
  return raw ? Number(raw) : null
})

// ─── 列表状态 ───

const list = ref<JobLog[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

// ─── 筛选状态（双对象模式） ───

const filter = reactive({ execStatus: '' as ExecStatus | '' })
const currentFilter = reactive({ execStatus: '' as ExecStatus | '' })

// ─── 详情弹窗 ───

const detailVisible = ref(false)
const detailLog = ref<JobLog | null>(null)

// ─── 计算属性 ───

const noJobId = computed(() => routeJobId.value === null)
const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// ─── 列表加载 ───

async function loadList() {
  if (noJobId.value) {
    errorMsg.value = t('job.missingJobId')
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const result = await pageJobLogs(routeJobId.value!, pageNum.value, pageSize.value)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('job.logLoadFailed')
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentFilter.execStatus = filter.execStatus
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.execStatus = ''
  currentFilter.execStatus = ''
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

// ─── 详情弹窗逻辑 ───

function openDetail(row: JobLog) {
  detailLog.value = row
  detailVisible.value = true
}

function closeDetail() {
  detailVisible.value = false
  detailLog.value = null
}

// 类型桥接
function detailRow(r: unknown) {
  openDetail(r as JobLog)
}

/** 统一操作列（V012-BUG-002）：只读日志页，仅「详情」一个动作 */
function rowActions(r: unknown): ListAction[] {
  return [
    {
      key: 'detail',
      label: t('common.detail'),
      onClick: () => detailRow(r),
    },
  ]
}

// ─── 辅助 ───

function execStatusTagType(status: ExecStatus): 'success' | 'danger' | 'warning' {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'warning' // RUNNING
}

function execStatusLabel(status: ExecStatus): string {
  if (status === 'SUCCESS') return t('common.resultSuccess')
  if (status === 'FAILED') return t('common.resultFailed')
  return t('common.statusRunning')
}

function triggerTypeLabel(type: TriggerType): string {
  return type === 'AUTO' ? t('job.triggerAuto') : t('job.triggerManual')
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('job.executionLog')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <el-select
        v-model="filter.execStatus"
        :placeholder="t('common.executionStatus')"
        clearable
        style="width: 140px"
      >
        <el-option :label="t('common.statusRunning')" value="RUNNING" />
        <el-option :label="t('common.resultSuccess')" value="SUCCESS" />
        <el-option :label="t('common.resultFailed')" value="FAILED" />
      </el-select>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <!-- 缺少 jobId -->
    <el-alert
      v-if="noJobId"
      :title="t('job.openFromJobListHint')"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <!-- 加载错误 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column
        prop="jobName"
        :label="t('common.taskName')"
        min-width="140"
        show-overflow-tooltip
      />
      <el-table-column :label="t('job.triggerType')" width="80" align="center">
        <template #default="{ row }">
          <el-tag
            size="small"
            :type="(row as JobLog).triggerType === 'MANUAL' ? 'warning' : 'info'"
          >
            {{ triggerTypeLabel((row as JobLog).triggerType as TriggerType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.executionStatus')" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="execStatusTagType((row as JobLog).execStatus as ExecStatus)">
            {{ execStatusLabel((row as JobLog).execStatus as ExecStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="startTime" :label="t('common.startTime')" width="170" />
      <el-table-column prop="endTime" :label="t('common.endTime')" width="170" />
      <el-table-column :label="t('common.duration')" width="100" align="right">
        <template #default="{ row }">
          {{ (row as JobLog).duration != null ? `${(row as JobLog).duration}ms` : '-' }}
        </template>
      </el-table-column>
      <el-table-column
        prop="resultMsg"
        :label="t('common.result')"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column prop="createTime" :label="t('common.createTime')" width="170" />
      <ListActionsColumn :actions="rowActions" :width="90" />
    </el-table>

    <!-- 空态（默认文案） -->
    <template #empty-action>
      <span />
    </template>
  </StandardListTemplate>

  <!-- 详情弹窗 -->
  <el-dialog
    v-model="detailVisible"
    :title="t('job.executionDetail')"
    width="640px"
    destroy-on-close
    @closed="closeDetail"
  >
    <template v-if="detailLog">
      <el-descriptions :column="2" border>
        <el-descriptions-item :label="t('common.taskName')">{{
          detailLog.jobName
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('job.triggerType')">{{
          triggerTypeLabel(detailLog.triggerType as TriggerType)
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('common.executionStatus')">
          <el-tag size="small" :type="execStatusTagType(detailLog.execStatus as ExecStatus)">
            {{ execStatusLabel(detailLog.execStatus as ExecStatus) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.duration')">{{
          detailLog.duration != null ? `${detailLog.duration}ms` : '-'
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('common.startTime')">{{
          detailLog.startTime ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('common.endTime')">{{
          detailLog.endTime ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('job.resultInfo')" :span="2">{{
          detailLog.resultMsg ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item
          v-if="detailLog.jobParams"
          :label="t('job.executionParams')"
          :span="2"
        >
          <code style="white-space: pre-wrap; font-size: 12px">{{ detailLog.jobParams }}</code>
        </el-descriptions-item>
        <el-descriptions-item
          v-if="detailLog.exceptionStack"
          :label="t('job.errorStack')"
          :span="2"
        >
          <code style="white-space: pre-wrap; font-size: 12px; color: #f56c6c">{{
            detailLog.exceptionStack
          }}</code>
        </el-descriptions-item>
      </el-descriptions>
    </template>
    <template #footer>
      <el-button @click="closeDetail">{{ t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
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
import { StandardListTemplate } from '@/components/page-layout'
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
    errorMsg.value = '缺少任务 ID 参数'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const result = await pageJobLogs(routeJobId.value!, pageNum.value, pageSize.value)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : '加载执行日志失败'
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

// ─── 辅助 ───

function execStatusTagType(status: ExecStatus): 'success' | 'danger' | 'warning' {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  return 'warning' // RUNNING
}

function execStatusLabel(status: ExecStatus): string {
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  return '运行中'
}

function triggerTypeLabel(type: TriggerType): string {
  return type === 'AUTO' ? '自动' : '手动'
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="执行日志"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <el-select v-model="filter.execStatus" placeholder="执行状态" clearable style="width: 140px">
        <el-option label="运行中" value="RUNNING" />
        <el-option label="成功" value="SUCCESS" />
        <el-option label="失败" value="FAILED" />
      </el-select>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </template>

    <!-- 缺少 jobId -->
    <el-alert
      v-if="noJobId"
      title="请从任务列表页跳转访问执行日志"
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
      <el-table-column prop="jobName" label="任务名称" min-width="140" show-overflow-tooltip />
      <el-table-column label="触发方式" width="80" align="center">
        <template #default="{ row }">
          <el-tag
            size="small"
            :type="(row as JobLog).triggerType === 'MANUAL' ? 'warning' : 'info'"
          >
            {{ triggerTypeLabel((row as JobLog).triggerType as TriggerType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="执行状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="execStatusTagType((row as JobLog).execStatus as ExecStatus)">
            {{ execStatusLabel((row as JobLog).execStatus as ExecStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="startTime" label="开始时间" width="170" />
      <el-table-column prop="endTime" label="结束时间" width="170" />
      <el-table-column label="耗时" width="100" align="right">
        <template #default="{ row }">
          {{ (row as JobLog).duration != null ? `${(row as JobLog).duration}ms` : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="resultMsg" label="结果" min-width="160" show-overflow-tooltip />
      <el-table-column prop="createTime" label="创建时间" width="170" />
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="detailRow(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态（默认文案） -->
    <template #empty-action>
      <span />
    </template>
  </StandardListTemplate>

  <!-- 详情弹窗 -->
  <el-dialog
    v-model="detailVisible"
    title="执行详情"
    width="640px"
    destroy-on-close
    @closed="closeDetail"
  >
    <template v-if="detailLog">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="任务名称">{{ detailLog.jobName }}</el-descriptions-item>
        <el-descriptions-item label="触发方式">{{
          triggerTypeLabel(detailLog.triggerType as TriggerType)
        }}</el-descriptions-item>
        <el-descriptions-item label="执行状态">
          <el-tag size="small" :type="execStatusTagType(detailLog.execStatus as ExecStatus)">
            {{ execStatusLabel(detailLog.execStatus as ExecStatus) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="耗时">{{
          detailLog.duration != null ? `${detailLog.duration}ms` : '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="开始时间">{{
          detailLog.startTime ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="结束时间">{{ detailLog.endTime ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="结果信息" :span="2">{{
          detailLog.resultMsg ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item v-if="detailLog.jobParams" label="执行参数" :span="2">
          <code style="white-space: pre-wrap; font-size: 12px">{{ detailLog.jobParams }}</code>
        </el-descriptions-item>
        <el-descriptions-item v-if="detailLog.exceptionStack" label="异常堆栈" :span="2">
          <code style="white-space: pre-wrap; font-size: 12px; color: #f56c6c">{{
            detailLog.exceptionStack
          }}</code>
        </el-descriptions-item>
      </el-descriptions>
    </template>
    <template #footer>
      <el-button @click="closeDetail">关闭</el-button>
    </template>
  </el-dialog>
</template>

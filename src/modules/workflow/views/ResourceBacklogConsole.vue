<script setup lang="ts">
/**
 * ResourceBacklogConsole — P62 资源积压与配额控制台（RG05/RG06）。
 *
 * 分层展示：命令积压（按状态/类别）、引擎目标积压（异步 job/死信）、批量未完项；
 * 计数勾稽（占用计数 vs 持久事实）；命令明细分页与拒绝审计。
 * 未受理（拒绝）/排队（PENDING）/执行中（PROCESSING）/目标完成（效果/调用关联）/
 * 待核实（UNKNOWN 边界外露为失败原因与死信）在行级与汇总级均可区分。
 * 查看 workflow:resource:view 仅本租户；跨租户查询需 workflow:resource:manage。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { StandardFormTemplate } from '@/components/page-layout'
import {
  getBacklogSummary,
  getBacklogCommands,
  getResourceRejects,
  type ResourceBacklogSummary,
  type ResourceCommandRow,
  type ResourceRejectRow,
} from '@/modules/workflow/api/resource-ops'

const MANAGE_PERM = 'workflow:resource:manage'
const canManage = computed(() => hasPerm(MANAGE_PERM))

const summary = ref<ResourceBacklogSummary | null>(null)
const loadingSummary = ref(false)

const STATUS_TEXT: Record<string, string> = {
  PENDING: '排队中',
  PROCESSING: '执行中',
  COMPLETED: '已完成',
  FAILED: '失败',
  EXPIRED: '已过期（未生效）',
}
const CLASS_TEXT: Record<string, string> = {
  PROD: '生产',
  OA: '普通 OA',
  BULK: '后台批量',
  NONE: '未启用策略（旧对象）',
}

function statusTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'COMPLETED':
      return 'success'
    case 'PENDING':
    case 'PROCESSING':
      return 'warning'
    case 'FAILED':
    case 'EXPIRED':
      return 'danger'
    default:
      return 'info'
  }
}

async function refreshSummary(): Promise<void> {
  loadingSummary.value = true
  try {
    summary.value = await getBacklogSummary()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '汇总加载失败')
  } finally {
    loadingSummary.value = false
  }
}

/* ─── 命令明细 ─── */

const rows = ref<ResourceCommandRow[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const filterStatus = ref('')
const filterClass = ref('')
const loadingRows = ref(false)

async function refreshRows(): Promise<void> {
  loadingRows.value = true
  try {
    const result = await getBacklogCommands({
      page: page.value,
      size: size.value,
      status: filterStatus.value || undefined,
      resourceClass: filterClass.value || undefined,
    })
    rows.value = result.rows
    total.value = result.total
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '明细加载失败')
  } finally {
    loadingRows.value = false
  }
}

function changePage(next: number): void {
  page.value = next
  void refreshRows()
}

function onFilterChange(): void {
  page.value = 1
  void refreshRows()
}

/* ─── 拒绝审计 ─── */

const rejectRows = ref<ResourceRejectRow[]>([])
const rejectTotal = ref(0)
const rejectPage = ref(1)
const loadingRejects = ref(false)

async function refreshRejects(): Promise<void> {
  loadingRejects.value = true
  try {
    const result = await getResourceRejects({ page: rejectPage.value, size: 10 })
    rejectRows.value = result.rows
    rejectTotal.value = result.total
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '拒绝审计加载失败')
  } finally {
    loadingRejects.value = false
  }
}

const REJECT_SCOPE_TEXT: Record<string, string> = {
  QUOTA_TOTAL: '全局额度',
  QUOTA_TENANT: '租户额度',
  QUOTA_SEGMENT: '容量段',
  RATE: '速率',
  STOPPED: '停新受理',
  ENABLEMENT: '启用检查',
}

function counterTotal(summaryValue: ResourceBacklogSummary | null): number {
  if (!summaryValue) return 0
  return summaryValue.usageCounters['GLOBAL|0|TOTAL'] ?? 0
}

onMounted(() => {
  void refreshSummary()
  void refreshRows()
  void refreshRejects()
})
</script>

<template>
  <StandardFormTemplate
    title="资源积压与配额"
    subtitle="命令积压与引擎目标积压分层展示；占用计数与持久事实勾稽；拒绝审计独立可查"
  >
    <!-- 汇总 -->
    <section class="res-section">
      <h2 class="res-section__title">
        积压汇总
        <el-button link data-test="summary-refresh" @click="refreshSummary">刷新</el-button>
      </h2>
      <el-descriptions v-if="summary" :column="3" border size="small" data-test="summary-panel">
        <el-descriptions-item label="未完成命令（排队+执行）">
          <span data-test="open-commands">{{ summary.totalCommandsOpen }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="未完成工作量（单位）">
          <span data-test="incomplete-units">{{ summary.incompleteUnits }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="占用计数勾稽">
          <el-tag
            :type="summary.countersConsistentWithFacts ? 'success' : 'danger'"
            size="small"
            data-test="counter-consistency"
          >
            {{ summary.countersConsistentWithFacts ? '与事实一致' : '与事实漂移（对账将修复）' }}
            （计数 {{ counterTotal(summary) }}）
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="引擎目标积压（异步 job）">
          <span data-test="engine-pending">{{ summary.engineTargets['pendingJobs'] ?? 0 }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="引擎死信 job（待核实）">
          <span data-test="engine-deadletter">{{
            summary.engineTargets['deadLetterJobs'] ?? 0
          }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="批量未完项">
          <span data-test="batch-pending">{{ summary.batchPendingItems }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="统计窗口说明" :span="3">
          {{ summary.windowNote }}
        </el-descriptions-item>
        <el-descriptions-item label="完成点口径" :span="3">
          {{ summary.completionPointNote }}
        </el-descriptions-item>
      </el-descriptions>
      <div class="res-status-grid">
        <div
          v-for="row in summary?.commandsByStatus ?? []"
          :key="row.status"
          class="res-status-cell"
          :data-test="`status-${row.status}`"
        >
          <el-tag :type="statusTagType(row.status)" size="small">{{
            STATUS_TEXT[row.status] ?? row.status
          }}</el-tag>
          <span class="res-status-cell__count">{{ row.cnt }}</span>
        </div>
      </div>
    </section>

    <!-- 命令明细 -->
    <section class="res-section">
      <h2 class="res-section__title">命令明细</h2>
      <div class="res-filters">
        <el-select
          v-model="filterStatus"
          clearable
          placeholder="状态"
          style="width: 160px"
          data-test="filter-status"
          @change="onFilterChange"
        >
          <el-option v-for="(text, key) in STATUS_TEXT" :key="key" :label="text" :value="key" />
        </el-select>
        <el-select
          v-model="filterClass"
          clearable
          placeholder="资源类别"
          style="width: 160px"
          data-test="filter-class"
          @change="onFilterChange"
        >
          <el-option v-for="(text, key) in CLASS_TEXT" :key="key" :label="text" :value="key" />
        </el-select>
      </div>
      <el-table v-loading="loadingRows" :data="rows" size="small" data-test="command-table">
        <el-table-column label="命令" min-width="200">
          <template #default="{ row }">
            <div class="res-mono">{{ row.command_key }}</div>
            <div class="res-sub">
              {{ row.command_type }} · {{ CLASS_TEXT[row.resource_class ?? 'NONE'] ?? '—' }}
              <template v-if="row.resource_units">（{{ row.resource_units }} 单位）</template>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{
              STATUS_TEXT[row.status] ?? row.status
            }}</el-tag>
            <div v-if="row.overdue_at" class="res-sub res-sub--danger">已超截止</div>
          </template>
        </el-table-column>
        <el-table-column label="策略版本" width="80">
          <template #default="{ row }">{{ row.policy_version ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="受理时间" width="160">
          <template #default="{ row }">{{ row.create_time ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="完成/释放时间" width="160">
          <template #default="{ row }">{{ row.finished_at ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="失败原因" min-width="160">
          <template #default="{ row }">
            <span v-if="row.failure_reason" class="res-sub--danger">{{ row.failure_reason }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        layout="prev, pager, next, total"
        :total="total"
        :page-size="size"
        :current-page="page"
        data-test="command-pagination"
        @current-change="changePage"
      />
    </section>

    <!-- 拒绝审计 -->
    <section class="res-section">
      <h2 class="res-section__title">拒绝审计</h2>
      <el-table v-loading="loadingRejects" :data="rejectRows" size="small" data-test="reject-table">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ row.create_time }}</template>
        </el-table-column>
        <el-table-column label="范围" width="100">
          <template #default="{ row }">{{
            REJECT_SCOPE_TEXT[row.reject_scope] ?? row.reject_scope
          }}</template>
        </el-table-column>
        <el-table-column label="类别" width="90">
          <template #default="{ row }">{{
            CLASS_TEXT[row.resource_class ?? 'NONE'] ?? '—'
          }}</template>
        </el-table-column>
        <el-table-column label="请求数" width="80" prop="requested_units" />
        <el-table-column label="原因 key" min-width="180">
          <template #default="{ row }"
            ><span class="res-mono">{{ row.reason_code }}</span></template
          >
        </el-table-column>
        <el-table-column label="明细" min-width="220" prop="detail" />
      </el-table>
      <el-pagination
        layout="prev, pager, next, total"
        :total="rejectTotal"
        :page-size="10"
        :current-page="rejectPage"
        data-test="reject-pagination"
        @current-change="refreshRejects"
      />
      <p v-if="!canManage" class="res-note">当前仅显示本租户数据；跨租户运维需独立管理授权。</p>
    </section>
  </StandardFormTemplate>
</template>

<style scoped>
.res-section {
  margin-bottom: 24px;
}

.res-section__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.res-status-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.res-status-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.res-status-cell__count {
  font-weight: 600;
}

.res-mono {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}

.res-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.res-sub--danger {
  color: var(--el-color-danger);
}

.res-filters {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.res-note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

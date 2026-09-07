<script setup lang="ts">
/**
 * MyInstances — 我发起的流程列表页（页型 B）。
 *
 * 状态筛选 + 关键字搜索 + 真分页；行操作「详情」弹窗展示
 * 实例信息、当前进度与流转记录（审批历史）。
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import { myInstances, myInstanceDetail } from '@/modules/workflow/api'
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

const STATUS_TAG: Record<string, { label: string; type: 'warning' | 'success' | 'danger' }> = {
  RUNNING: { label: '进行中', type: 'warning' },
  APPROVED: { label: '已通过', type: 'success' },
  REJECTED: { label: '已驳回', type: 'danger' },
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
      errorMsg.value = '加载我发起的流程失败'
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
    detailError.value = err instanceof ApiError ? err.msg : '加载流程详情失败'
  } finally {
    detailLoading.value = false
  }
}

// ─── 流转记录映射 ───
const APPROVAL_RESULT_MAP: Record<string, { label: string; type: 'success' | 'danger' | 'info' }> =
  {
    APPROVED: { label: '通过', type: 'success' },
    REJECTED: { label: '驳回', type: 'danger' },
    RETURNED: { label: '已退回', type: 'info' },
  }

// 动作标签（对齐 MyProcessed 的 ACTION_TAG 口径）
const ACTION_LABEL_MAP: Record<string, string> = {
  APPROVE: '通过',
  REJECT: '驳回',
  RETURN: '退回',
}

function actionLabel(action: string | null): string {
  if (!action) return '-'
  return ACTION_LABEL_MAP[action] ?? action
}

function resultLabel(result: string | null): string {
  if (!result) return '进行中'
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
      ElMessage.success(resp.detail || '已通知当前待办人')
    } else if (resp.result === 'COOLDOWN') {
      ElMessage.warning(resp.detail || '冷却中，暂不能再次催办')
    } else {
      ElMessage.info(resp.detail || '当前不能催办')
    }
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '催办失败')
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
    title="我发起的"
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
        placeholder="状态"
        clearable
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option label="进行中" value="RUNNING" />
        <el-option label="已通过" value="APPROVED" />
        <el-option label="已驳回" value="REJECTED" />
      </el-select>
      <el-input
        v-model="filter.keyword"
        placeholder="流程名称/业务单号"
        clearable
        style="width: 200px"
        @keyup.enter="handleSearch"
      />
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleSearch">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
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
      <el-table-column label="流程名称" min-width="150">
        <template #default="{ row }">
          {{ row.processName ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="processDefKey" label="流程标识" min-width="150" />
      <el-table-column prop="businessKey" label="业务单号" min-width="120" />
      <el-table-column prop="formKey" label="表单标识" min-width="130" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createTime" label="发起时间" min-width="170" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openDetailRow(row)">详情</el-button>
          <el-button
            v-if="row.status === 'RUNNING'"
            v-perm="'workflow:urge'"
            size="small"
            type="warning"
            link
            :disabled="urgingId === row.id"
            @click="urgeRow(row)"
          >
            催办
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 详情弹窗 -->
  </StandardListTemplate>
  <el-dialog v-model="detailVisible" title="流程详情" width="760px">
    <div v-loading="detailLoading">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon />
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="流程名称">
            {{ detail.processName ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(detail.status)" size="small">
              {{ statusLabel(detail.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="流程标识">
            {{ detail.instance.processDefKey }}
          </el-descriptions-item>
          <el-descriptions-item label="业务单号">{{ detail.businessKey }}</el-descriptions-item>
          <el-descriptions-item label="表单标识">{{ detail.formKey }}</el-descriptions-item>
          <el-descriptions-item label="发起时间">
            {{ detail.instance.createTime }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 当前进度 -->
        <h4 class="detail-section-title">当前进度</h4>
        <el-alert
          v-if="detail.progress.length === 0"
          title="流程已结束，无进行中的节点"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table v-else :data="detail.progress" stripe size="small">
          <el-table-column prop="taskName" label="节点" min-width="140" />
          <el-table-column prop="nodeKey" label="节点标识" min-width="140" />
          <el-table-column prop="assignee" label="办理人" min-width="120" />
          <el-table-column label="任务编号" min-width="140">
            <template #default="{ row }">
              {{ row.taskId }}
            </template>
          </el-table-column>
        </el-table>

        <!-- 流转记录 -->
        <h4 class="detail-section-title">流转记录</h4>
        <el-alert
          v-if="detail.history.length === 0"
          title="暂无流转记录"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table v-else :data="detail.history" stripe size="small">
          <el-table-column prop="taskName" label="节点" min-width="120" />
          <el-table-column label="办理人" min-width="110">
            <template #default="{ row }">
              {{ row.assigneeName ?? row.assignee ?? '-' }}
            </template>
          </el-table-column>
          <el-table-column label="动作" width="90">
            <template #default="{ row }">
              {{ actionLabel(row.action) }}
            </template>
          </el-table-column>
          <el-table-column label="结果" width="90">
            <template #default="{ row }">
              <el-tag :type="resultTagType(row.approvalResult)" size="small">
                {{ resultLabel(row.approvalResult) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="意见" min-width="150">
            <template #default="{ row }">
              {{ row.opinionData?.comment ?? '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="createTime" label="到达时间" min-width="160" />
          <el-table-column label="办理时间" min-width="160">
            <template #default="{ row }">
              {{ row.endTime ?? '-' }}
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>
    <template #footer>
      <el-button @click="detailVisible = false">关闭</el-button>
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

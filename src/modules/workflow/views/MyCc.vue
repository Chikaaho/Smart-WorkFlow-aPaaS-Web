<script setup lang="ts">
/**
 * MyCc — 抄送我的（v0.0.2 OA 个人办理，页型 B）。
 *
 * 仅本人收到的抄送（服务端强制 recipient=当前用户），关键字 + 时间窗过滤，
 * 稳定分页；行操作「详情」弹窗展示抄送/实例信息、只读表单快照与审批进度/意见。
 * 抄送身份不含审批操作权（无同意/驳回入口）。
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { StandardListTemplate } from '@/components/page-layout'
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
    errorMsg.value = err instanceof ApiError ? err.msg : '加载抄送列表失败'
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
    detailError.value = err instanceof ApiError ? err.msg : '加载抄送详情失败'
  } finally {
    detailLoading.value = false
  }
}

function openDetailRow(r: unknown) {
  void openDetail(r as MyCopyItem)
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
    title="抄送我的"
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
        range-separator="至"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        style="width: 340px"
      />
      <el-input
        v-model="filter.processInstanceId"
        placeholder="流程实例ID（精确）"
        clearable
        style="width: 260px"
        @keyup.enter="handleSearch"
      />
      <el-input
        v-model="filter.keyword"
        placeholder="表单标识/业务单号/流程标识"
        clearable
        style="width: 220px"
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
      <el-table-column prop="formKey" label="表单标识" min-width="140" />
      <el-table-column prop="processDefKey" label="流程标识" min-width="150" />
      <el-table-column prop="businessKey" label="业务单号" min-width="130" />
      <el-table-column prop="nodeKey" label="抄送节点" min-width="120" />
      <el-table-column label="实例状态" width="100">
        <template #default="{ row }">
          {{ row.instanceStatus ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="deliveryStatus" label="投递状态" width="100" />
      <el-table-column prop="createTime" label="抄送时间" min-width="170" />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openDetailRow(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>

  <el-dialog v-model="detailVisible" title="抄送详情（只读）" width="760px">
    <div v-loading="detailLoading">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon />
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="流程标识">
            {{ detailInstance?.processDefKey ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="实例状态">
            {{ detailInstance?.status ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="业务单号">
            {{ detailInstance?.businessKey ?? '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="抄送节点">
            {{ detailCopy.nodeKey ?? '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="detail-section-title">表单数据（只读快照）</h4>
        <el-alert
          v-if="Object.keys(detailFormData).length === 0"
          title="无表单数据"
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

        <h4 class="detail-section-title">审批进度</h4>
        <el-alert
          v-if="detail.progress.length === 0"
          title="流程已结束，无进行中的节点"
          type="info"
          :closable="false"
          show-icon
        />
        <el-table v-else :data="detail.progress" stripe size="small">
          <el-table-column prop="name" label="节点" min-width="140" />
          <el-table-column prop="assignee" label="办理人" min-width="120" />
        </el-table>

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
          <el-table-column prop="action" label="动作" width="90" />
          <el-table-column prop="settlementStatus" label="结果" width="90" />
          <el-table-column prop="createTime" label="到达时间" min-width="160" />
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

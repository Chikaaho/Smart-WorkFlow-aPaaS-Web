<script setup lang="ts">
/**
 * MyProcessed — 我的已办列表页（新契约，页型 B）。
 *
 * 展示当前用户办理过的任务：审批动作、办理时间、实例状态与来源标记
 * （ACTION=动作通道 / HISTORY_COMPAT=历史兼容）。分页 + 来源筛选。
 */
import { ref, computed, reactive, onMounted } from 'vue'
import { StandardListTemplate } from '@/components/page-layout'
import { myProcessed } from '@/modules/workflow/api'
import type { MyProcessedItem } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

// ─── 列表状态 ───
const list = ref<MyProcessedItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<{ source: string }>({ source: '' })

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

const ACTION_TAG: Record<string, { label: string; type: 'success' | 'danger' | 'warning' }> = {
  APPROVE: { label: '通过', type: 'success' },
  REJECT: { label: '驳回', type: 'danger' },
  RETURN: { label: '退回', type: 'warning' },
}

const INSTANCE_STATUS_TAG: Record<
  string,
  { label: string; type: 'warning' | 'success' | 'danger' }
> = {
  RUNNING: { label: '进行中', type: 'warning' },
  APPROVED: { label: '已通过', type: 'success' },
  REJECTED: { label: '已驳回', type: 'danger' },
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await myProcessed(pageQuery, {
      source: filter.source || undefined,
    })
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载我的已办失败'
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
  filter.source = ''
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

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="我的已办"
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
        v-model="filter.source"
        placeholder="来源"
        clearable
        style="width: 180px"
        @change="handleSearch"
      >
        <el-option label="动作通道" value="ACTION" />
        <el-option label="历史兼容" value="HISTORY_COMPAT" />
      </el-select>
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
      <el-table-column prop="taskName" label="任务名称" min-width="130" />
      <el-table-column label="流程名称" min-width="140">
        <template #default="{ row }">
          {{ row.processName ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="formKey" label="表单标识" min-width="130" />
      <el-table-column prop="businessKey" label="业务单号" min-width="120" />
      <el-table-column label="动作" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.action" :type="ACTION_TAG[row.action]?.type ?? 'info'" size="small">
            {{ ACTION_TAG[row.action]?.label ?? row.action }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="办理时间" min-width="170">
        <template #default="{ row }">
          {{ row.handleTime ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column label="实例状态" width="100">
        <template #default="{ row }">
          <el-tag
            v-if="row.instanceStatus"
            :type="INSTANCE_STATUS_TAG[row.instanceStatus]?.type ?? 'info'"
            size="small"
          >
            {{ INSTANCE_STATUS_TAG[row.instanceStatus]?.label ?? row.instanceStatus }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="来源" width="100">
        <template #default="{ row }">
          <el-tag :type="row.source === 'ACTION' ? 'success' : 'info'" size="small" effect="plain">
            {{ row.source === 'ACTION' ? '动作通道' : '历史兼容' }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>
</template>

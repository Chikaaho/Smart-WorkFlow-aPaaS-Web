<template>
  <div class="system-log-page">
    <h1 class="page-title">日志查询</h1>
    <el-card shadow="never" class="log-card">
      <el-tabs v-model="activeTab" class="log-tabs">
        <el-tab-pane v-for="tab in TABS" :key="tab.type" :label="tab.label" :name="tab.type" />
      </el-tabs>

      <div class="filter-bar">
        <el-input
          v-model="filter.username"
          placeholder="账号"
          clearable
          class="filter-input"
          @keyup.enter="load(true)"
        />
        <el-input
          v-model="filter.module"
          placeholder="模块"
          clearable
          class="filter-input filter-input--short"
          @keyup.enter="load(true)"
        />
        <el-input
          v-model="filter.ip"
          placeholder="IP"
          clearable
          class="filter-input filter-input--short"
          @keyup.enter="load(true)"
        />
        <el-select
          v-model="filter.result"
          placeholder="结果"
          clearable
          class="filter-input filter-input--short"
        >
          <el-option label="成功" value="SUCCESS" />
          <el-option label="失败" value="FAIL" />
        </el-select>
        <el-date-picker
          v-model="range"
          type="datetimerange"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          value-format="YYYY-MM-DDTHH:mm:ss"
          class="filter-range"
        />
        <el-button type="primary" @click="load(true)">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" class="log-table">
        <el-table-column label="时间" prop="createTime" width="170" />
        <el-table-column label="账号" prop="username" width="140" show-overflow-tooltip />
        <el-table-column v-if="canFilterTenant" label="租户" prop="tenantId" width="80" />
        <el-table-column label="模块" prop="module" width="110" />
        <el-table-column label="动作" prop="action" width="120" show-overflow-tooltip />
        <el-table-column label="对象" prop="target" min-width="180" show-overflow-tooltip />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.result === 'SUCCESS' ? 'success' : 'danger'" size="small">
              {{ row.result === 'SUCCESS' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="原因 / 摘要" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.failReason || row.summary || '' }}
          </template>
        </el-table-column>
        <el-table-column label="IP" prop="ip" width="130" show-overflow-tooltip />
        <el-table-column label="浏览器" prop="userAgent" min-width="160" show-overflow-tooltip />
        <template #empty>
          <div class="log-empty">暂无日志记录</div>
        </template>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="pageNum"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @change="load(false)"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { pageAuditLogs } from '@/modules/system/api/auditLog'
import type { AuditLogItem, AuditLogType } from '@/modules/system/api/auditLog'
import { hasPerm } from '@/foundation/permission'

const TABS: { type: AuditLogType; label: string }[] = [
  { type: 'LOGIN', label: '登录日志' },
  { type: 'OPERATION', label: '操作日志' },
  { type: 'EXCEPTION', label: '异常日志' },
]

const canFilterTenant = computed(() => hasPerm('system:log:list') && hasPerm('system:tenant:list'))
const activeTab = ref<AuditLogType>('LOGIN')
const loading = ref(false)
const rows = ref<AuditLogItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const range = ref<[string, string] | null>(null)
const filter = reactive<{ username: string; module: string; ip: string; result: string }>({
  username: '',
  module: '',
  ip: '',
  result: '',
})

async function load(resetPage: boolean) {
  if (resetPage) pageNum.value = 1
  loading.value = true
  try {
    const page = await pageAuditLogs(pageNum.value, pageSize.value, {
      logType: activeTab.value,
      username: filter.username || undefined,
      module: filter.module || undefined,
      ip: filter.ip || undefined,
      result: filter.result || undefined,
      beginTime: range.value?.[0] || undefined,
      endTime: range.value?.[1] || undefined,
    })
    rows.value = page.records
    total.value = page.total
  } finally {
    loading.value = false
  }
}

function reset() {
  filter.username = ''
  filter.module = ''
  filter.ip = ''
  filter.result = ''
  range.value = null
  load(true)
}

watch(activeTab, () => load(true))
onMounted(() => load(true))
</script>

<style scoped>
.system-log-page {
  padding: 0 20px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 4px 0 16px;
}
.log-card {
  border-radius: 6px;
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}
.filter-input {
  width: 200px;
}
.filter-input--short {
  width: 130px;
}
.filter-range {
  width: 360px;
}
.log-table {
  width: 100%;
}
.log-empty {
  padding: 32px 0;
  color: var(--el-text-color-secondary);
}
.pager {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
}
</style>

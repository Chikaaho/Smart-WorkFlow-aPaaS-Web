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
        <el-table-column label="时间" prop="createTime" width="180">
          <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="账号" prop="username" width="140" show-overflow-tooltip />
        <el-table-column v-if="canFilterTenant" label="租户" prop="tenantId" width="80" />
        <el-table-column label="模块" width="130">
          <template #default="{ row }">{{ displayModule(row.module, row.logType) }}</template>
        </el-table-column>
        <el-table-column label="动作" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ displayAction(row.action) }}</template>
        </el-table-column>
        <el-table-column label="对象" prop="target" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.target || '—' }}</template>
        </el-table-column>
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
        <el-table-column v-if="activeTab === 'EXCEPTION'" type="expand" width="40">
          <template #default="{ row }">
            <div class="exception-detail">
              <div>
                <span class="exception-detail__label">异常类型：</span
                >{{ row.exceptionType || '—' }}
              </div>
              <div><span class="exception-detail__label">请求：</span>{{ row.target || '—' }}</div>
              <div>
                <span class="exception-detail__label">事件引用：</span>{{ row.traceId || '—' }}
              </div>
              <div>
                <span class="exception-detail__label">摘要：</span
                >{{ row.summary || row.failReason || '—' }}
              </div>
            </div>
          </template>
        </el-table-column>
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

/** 时间列统一 yyyy-MM-dd HH:mm:ss（服务端 ISO 原文带 T/微秒，显示层收敛）。 */
function formatDateTime(raw?: string | null): string {
  if (!raw) return ''
  const text = String(raw).replace('T', ' ')
  return text.length > 19 ? text.slice(0, 19) : text
}

/** 动作中文化（新数据已是中文；兼容历史英文/方法码，避免动作被截断）。 */
const ACTION_LABELS: Record<string, string> = {
  LOGIN: '登录',
  LOGOUT: '登出',
  CHANGE_PASSWORD: '修改密码',
  POST: '操作',
  PUT: '修改',
  PATCH: '修改',
  DELETE: '删除',
}

/** 模块中文化（新数据已是中文；兼容历史代码段）。 */
const MODULE_LABELS: Record<string, string> = {
  user: '用户管理',
  'user-group': '用户组管理',
  role: '角色管理',
  dept: '部门管理',
  post: '岗位管理',
  'post-delegate': '岗位代理',
  menu: '菜单管理',
  dict: '字典管理',
  tenant: '租户管理',
  sso: '单点登录',
  'notify-subject-binding': '通知主体绑定',
  'user-workspace': '工作台配置',
  'audit-log': '日志查询',
  defs: '流程定义',
  categories: '流程分类',
  catalog: '流程目录',
  def: '表单定义',
  api: '接口',
}

function displayAction(action?: string | null): string {
  if (!action) return '—'
  return ACTION_LABELS[action] ?? action
}

function displayModule(module?: string | null, logType?: string | null): string {
  if (!module) {
    return logType === 'LOGIN' ? '认证' : '—'
  }
  return MODULE_LABELS[module] ?? module
}
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
.exception-detail {
  padding: 4px 16px;
  line-height: 24px;
  color: var(--el-text-color-regular);
}
.exception-detail__label {
  color: var(--el-text-color-secondary);
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

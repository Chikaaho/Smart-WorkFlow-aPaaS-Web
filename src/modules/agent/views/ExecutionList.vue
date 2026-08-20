<script setup lang="ts">
/**
 * ExecutionList — 图执行历史列表页（页型 B）。
 *
 * 分页展示指定图表定义的执行历史记录，提供：
 *   - 查看详情（跳转 /agent/executions/detail/:id）
 *
 * 权限：页面级走菜单驱动路由（sys_menu V26 行 permission=agent:model:view）；
 * 按钮级权限使用 agent:model:view（前端 hasPerm 仅 UX 显隐，真实鉴权在后端）。
 *
 * 数据说明：
 *   - graphDefId 从 URL query 获取，用于过滤当前图表定义的执行记录
 *   - defVersion 通过关联查询 getGraphDefVersionOnly 补充（避免大字段）
 *   - input/output 等变量快照大字段不塞入列表主查询（D126 §6）
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { StandardListTemplate } from '@/components/page-layout'
import { pageGraphExecutionsWithVersion } from '@/modules/agent/api'
import type { AgentGraphExecution } from '@/contracts/agent'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { usePermission } from '@/foundation/permission'

const route = useRoute()
const router = useRouter()
const { hasPerm } = usePermission()

// ─── 状态映射 ───

const STATUS_MAP: Record<
  string,
  { label: string; type: 'success' | 'warning' | 'info' | 'danger' }
> = {
  RUNNING: { label: '运行中', type: 'warning' },
  SUCCESS: { label: '成功', type: 'success' },
  FAILED: { label: '失败', type: 'danger' },
}

function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status
}

function getStatusType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  const t = STATUS_MAP[status]?.type
  return (t || 'info') as 'success' | 'warning' | 'info' | 'danger'
}

// ─── 列表状态 ───

const list = ref<AgentGraphExecution[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

// graphDefId 来自 URL query，用于过滤
const graphDefId = computed(() => Number(route.query.graphDefId || 0))

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// 按钮级权限控制
const canViewDetail = computed(() => hasPerm('agent:model:view'))

/** 加载列表数据 */
async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const page: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    // 带 graphDefId 过滤的参数
    const params = graphDefId.value > 0 ? { ...page, graphDefId: graphDefId.value } : page
    const result = await pageGraphExecutionsWithVersion(params)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载执行历史记录列表失败'
    }
  } finally {
    loading.value = false
  }
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

/** 查看详情：跳转到详情页 */
function handleViewDetail(row: AgentGraphExecution) {
  void router.push(`/agent/executions/detail/${row.id}`)
}

onMounted(() => {
  void loadList()
})
</script>

<template>
  <StandardListTemplate
    title="执行历史记录"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <!-- 工具栏扩展操作（如需） -->
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
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="graphName" label="图名称" min-width="180" />
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="版本" width="90">
        <template #default="{ row }">
          v{{ (row as AgentGraphExecution).defVersion ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="latencyMs" label="耗时 (ms)" width="100" align="right">
        <template #default="{ row }">
          {{ (row as AgentGraphExecution).latencyMs }}
        </template>
      </el-table-column>
      <el-table-column prop="errorCategory" label="失败分类" width="160">
        <template #default="{ row }">
          <span v-if="(row as AgentGraphExecution).errorCategory" class="error-category">
            {{ (row as AgentGraphExecution).errorCategory }}
          </span>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="errorMessage" label="失败摘要" min-width="180">
        <template #default="{ row }">
          <span v-if="(row as AgentGraphExecution).errorMessage" class="text-truncate">
            {{ (row as AgentGraphExecution).errorMessage }}
          </span>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="createTime" label="发生时间" width="180" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="canViewDetail"
            size="small"
            link
            type="primary"
            @click="handleViewDetail(row as AgentGraphExecution)"
          >
            详情
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>
</template>

<style scoped>
.error-category {
  font-family: 'Courier New', Monaco, monospace;
  font-size: 12px;
  color: #e6a23c;
  background: #fdf6ec;
  padding: 2px 6px;
  border-radius: 3px;
}

.text-muted {
  color: #c0c4cc;
  font-size: 12px;
}

.text-truncate {
  display: inline-block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
</style>

<script setup lang="ts">
/**
 * ExecutionList — 图执行历史列表页（页型 B）。
 *
 * 分页展示指定图表定义的执行历史记录，提供：
 *   - 查看详情（跳转 /agent/executions/detail/:id）
 *   - Token 汇总展示（M07-F04-02：inputTokens/outputTokens/total，null=未知）
 *
 * 权限：页面级走菜单驱动路由（sys_menu V26 行 permission=agent:model:view）；
 * 按钮级权限使用 agent:model:view（前端 hasPerm 仅 UX 显隐，真实鉴权在后端）。
 *
 * 数据说明：
 *   - graphDefId 从 URL query 获取，用于过滤当前图表定义的执行记录
 *   - defVersion 通过关联查询 getGraphDefVersionOnly 补充（避免大字段）
 *   - input/output 等变量快照大字段不塞入列表主查询（D126 §6）
 *   - Token 字段由后端 AgentGraphExecutionDTO 直接返回（V35 新增）
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { StandardListTemplate } from '@/components/page-layout'
import { pageGraphExecutionsWithVersion, pageDebugSessions } from '@/modules/agent/api'
import type { AgentGraphExecution, AgentGraphDebugSession } from '@/contracts/agent'
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
  PAUSED: { label: '已暂停', type: 'info' },
  COMPLETED: { label: '已完成', type: 'success' },
  STOPPED: { label: '已停止', type: 'info' },
  EXPIRED: { label: '已过期', type: 'warning' },
}

function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status
}

function getStatusType(status: string): 'success' | 'warning' | 'info' | 'danger' {
  const t = STATUS_MAP[status]?.type
  return (t as 'success' | 'warning' | 'info' | 'danger' | undefined) ?? 'info'
}

type MergedRow = AgentGraphExecution & { _debug: boolean }

function debugToRow(s: AgentGraphDebugSession): MergedRow {
  return {
    id: s.id,
    graphDefId: s.graphDefId,
    graphKey: '',
    graphName: `图 #${s.graphDefId}`,
    graphDefVersion: s.graphDefVersion,
    defVersion: s.graphDefVersion,
    input: s.input,
    status: s.status,
    outputSummary: (s.resultText ?? s.errorMessage ?? '') as string,
    errorCategory: (s.errorCategory ?? undefined) as string | undefined,
    errorMessage: (s.errorMessage ?? undefined) as string | undefined,
    success: s.status === 'COMPLETED',
    latencyMs: (s.latencyMs ?? 0) as number,
    inputTokens: s.inputTokens ?? null,
    outputTokens: s.outputTokens ?? null,
    createTime: s.createTime,
    _debug: true,
  } as unknown as MergedRow
}

function toMergedExecRow(e: AgentGraphExecution): MergedRow {
  return { ...e, _debug: false } as MergedRow
}

// ─── 列表状态 ───

const list = ref<MergedRow[]>([])
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

// M07-F04-02: Token 格式化（未知与 0 严格区分，total=未知时显示未知）
function formatTokenCount(count: number | null | undefined): string {
  if (count === null || count === undefined) return '未知'
  if (count === 0) return '0'
  return count.toLocaleString()
}
function totalTokensOf(
  row: MergedRow | AgentGraphExecution | Record<string, unknown>,
): number | null {
  const input = (row as { inputTokens?: number | null }).inputTokens
  const output = (row as { outputTokens?: number | null }).outputTokens
  if (input === null || input === undefined || output === null || output === undefined) return null
  return input + output
}

/** 加载列表数据：并行拉取执行与调试两域，合并入同一列表（G11 既有入口闭环） */
async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const page: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const params = graphDefId.value > 0 ? { ...page, graphDefId: graphDefId.value } : page
    const debugPromise: Promise<{
      list: AgentGraphDebugSession[]
      total: number
      pageNum: number
      pageSize: number
    }> =
      typeof pageDebugSessions === 'function'
        ? (
            pageDebugSessions as unknown as (p: PageQuery) => Promise<{
              list: AgentGraphDebugSession[]
              total: number
              pageNum: number
              pageSize: number
            }>
          )(params as unknown as PageQuery)
        : Promise.resolve({ list: [], total: 0, pageNum: 1, pageSize: page.pageSize })
    const [execRes, debugRes] = await Promise.allSettled([
      pageGraphExecutionsWithVersion(params),
      debugPromise,
    ])

    const execList: MergedRow[] = []
    const debugList: MergedRow[] = []
    let execTotal = 0
    let debugTotal = 0

    if (execRes.status === 'fulfilled') {
      for (const e of execRes.value.list) execList.push(toMergedExecRow(e))
      execTotal = execRes.value.total
    } else if (execRes.reason instanceof ApiError) {
      // 执行域失败：记录错误但不阻断调试域展示
      errorMsg.value = execRes.reason.msg
    }

    if (
      debugRes.status === 'fulfilled' &&
      (debugRes as unknown as { value: unknown }).value != null
    ) {
      const dv = (debugRes as unknown as { value: { list?: AgentGraphDebugSession[] } }).value
      if (Array.isArray(dv.list)) {
        for (const s of dv.list) debugList.push(debugToRow(s))
      }
      debugTotal = (debugRes as unknown as { value: { total?: number } }).value?.total ?? 0
    } else {
      // 调试域失败：静默降级为仅执行列表（不覆盖执行域错误）
      // 若执行域也失败，errorMsg 已设置
    }

    // 执行域失败且调试域成功：清除错误以展示调试记录
    if (execRes.status === 'rejected' && debugRes.status === 'fulfilled' && debugList.length > 0) {
      errorMsg.value = ''
    }

    // 若两域均失败
    if (execRes.status === 'rejected' && debugRes.status === 'rejected') {
      const r: unknown = execRes.reason
      if (r instanceof ApiError) errorMsg.value = r.msg
      else errorMsg.value = '加载执行历史记录列表失败'
      list.value = []
      total.value = 0
      return
    }

    // 合并两域并按 createTime 倒序（近者在前），与后端默认排序一致
    const merged = [...execList, ...debugList].sort((a, b) => {
      const ta = Date.parse((a.createTime as string) ?? '') || 0
      const tb = Date.parse((b.createTime as string) ?? '') || 0
      return tb - ta
    })
    list.value = merged
    total.value = execTotal + debugTotal
  } catch (err) {
    if (err instanceof ApiError) errorMsg.value = err.msg
    else errorMsg.value = '加载执行历史记录列表失败'
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

/** 查看详情：执行记录 → 执行详情，调试记录 → 调试详情（G11 既有入口穿透） */
function handleViewDetail(row: MergedRow | AgentGraphExecution | Record<string, unknown>) {
  if ((row as unknown as Record<string, unknown>)._debug) {
    void router.push(`/agent/debug/${(row as unknown as MergedRow).id}`)
  } else {
    void router.push(`/agent/executions/detail/${(row as unknown as MergedRow).id}`)
  }
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
      <el-table-column label="来源" width="90">
        <template #default="{ row }">
          <el-tag v-if="row._debug" type="info" size="small">调试</el-tag>
          <el-tag v-else size="small">执行</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="graphName" label="图名称" min-width="180" />
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="版本" width="90">
        <template #default="{ row }"> v{{ row.defVersion ?? '-' }} </template>
      </el-table-column>
      <el-table-column prop="latencyMs" label="耗时 (ms)" width="100" align="right">
        <template #default="{ row }">
          {{ row.latencyMs }}
        </template>
      </el-table-column>
      <!-- M07-F04-02: Token 汇总（输入 / 输出 / 总计；null=未知，不写零） -->
      <el-table-column label="输入 Token" width="110" align="right">
        <template #default="{ row }">
          <span class="token-cell">{{ formatTokenCount(row.inputTokens) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="输出 Token" width="110" align="right">
        <template #default="{ row }">
          <span class="token-cell">{{ formatTokenCount(row.outputTokens) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="总 Token" width="110" align="right">
        <template #default="{ row }">
          <span class="token-cell">{{ formatTokenCount(totalTokensOf(row)) }}</span>
        </template>
      </el-table-column>
      <!-- Token 非计费说明（D164 标准5） -->
      <el-table-column label="口径" width="90">
        <template #default>
          <el-tooltip content="供应商可观测 usage，非账单、非完整失败尝试成本" placement="top">
            <span class="token-disclaimer">可观测量</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column prop="errorCategory" label="失败分类" width="160">
        <template #default="{ row }">
          <span v-if="row.errorCategory" class="error-category">
            {{ row.errorCategory }}
          </span>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="errorMessage" label="失败摘要" min-width="180">
        <template #default="{ row }">
          <span v-if="row.errorMessage" class="text-truncate">
            {{ row.errorMessage }}
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
            @click="handleViewDetail(row)"
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

.token-cell {
  font-family: 'Courier New', Monaco, monospace;
  font-size: 12px;
}

.token-disclaimer {
  font-size: 11px;
  color: #909399;
  border-bottom: 1px dashed #c0c4cc;
  cursor: help;
}
</style>

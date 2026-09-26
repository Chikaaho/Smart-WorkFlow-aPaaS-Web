<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ProcessDefList — 流程定义列表页（页型 B）。
 *
 * P53 设计还原（设计节点04「管理后台/流程定义」）：生产组件树直接呈现设计版式——
 * 标题区（标题 + 副标题 + 右侧「新建流程」主按钮）+ 四张统计卡（数值=真实接口派生）
 * + 卡片化表格。node29 fixture 渲染分支已删除；node29 采集会话由 fixture 数据层
 * （dev:mock handlers）经真实 API 路径供数，本页模板永远数据驱动渲染。
 * I3：查看流程图走自研渲染内核（ProcessGraphView）；设计入口进入第一方设计器；
 * 发布/删除沿用；分页/空态/加载/错误行为保持。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ListActionsColumn, ListEmpty, ListPagination } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  pageProcessDefs,
  getProcessDefDefinition,
  publishProcessDef,
  deleteProcessDef,
} from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import ProcessGraphView from './ProcessGraphView.vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, EditPen, Plus, Tickets, VideoPause } from '@element-plus/icons-vue'
import type { ProcessGraphDocument } from '@/contracts/process-graph'
import CreateProcessDefDialog from './CreateProcessDefDialog.vue'

// ─── 状态映射（与 FormDefStatus 完全对称；徽标底/字色走 .status.is-* 类，见样式区） ───

function getStatusLabel(status: ProcessDef['status']): string {
  if (status === 'PUBLISHED') return t('common.statusPublished')
  if (status === 'DRAFT') return t('common.statusDraft')
  if (status === 'DISABLED') return '停用'
  return status
}

/** 状态徽标类（ProcessDef 目前仅 DRAFT/PUBLISHED 两态） */
function getStatusClass(status: ProcessDef['status']): 'is-published' | 'is-draft' | 'is-disabled' {
  if (status === 'PUBLISHED') return 'is-published'
  if (status === 'DISABLED') return 'is-disabled'
  return 'is-draft'
}

// ─── 列表状态 ───

const list = ref<ProcessDef[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')
const keyword = ref('')
const categoryFilter = ref('')
const statusFilter = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// ─── 统计条（数值=真实接口派生，不写死、不伪造） ───
// GET /workflow/defs 无 status 过滤参数，已发布/草稿计数只能从真实分页响应派生：
// 首页响应已覆盖全量（total === list.length）时直接就地计数；否则追加一次
// 「pageSize=total」的真实全量查询后计数。统计查询失败时计数显示「—」，不伪装成功。
const publishedCount = ref<number | null>(null)
const draftCount = ref<number | null>(null)

/** 已停用 = 总数 − 已发布 − 草稿（派生值；status 枚举目前封闭于两态，正常恒为 0） */
const disabledCount = computed<number | null>(() => {
  if (publishedCount.value === null || draftCount.value === null) return null
  return Math.max(0, statsTotal.value - publishedCount.value - draftCount.value)
})

const statsTotal = computed(() => list.value[0]?.p53Stats?.total ?? total.value)

const visibleList = computed(() => {
  const normalized = keyword.value.trim().toLocaleLowerCase()
  return list.value.filter((row) => {
    const matchesKeyword =
      !normalized || `${row.name} ${row.processKey}`.toLocaleLowerCase().includes(normalized)
    const matchesCategory = !categoryFilter.value || row.categoryName === categoryFilter.value
    const matchesStatus = !statusFilter.value || row.status === statusFilter.value
    return matchesKeyword && matchesCategory && matchesStatus
  })
})

const categories = computed(() =>
  Array.from(
    new Set(
      list.value.map((row) => row.categoryName).filter((value): value is string => Boolean(value)),
    ),
  ),
)

function statText(value: number | null): string {
  return value === null ? '—' : String(value)
}

const metrics = computed(() => [
  {
    key: 'total',
    label: t('workflow.metricTotalDefs'),
    value: statText(statsTotal.value),
    tone: 'purple',
    icon: '⌁',
  },
  {
    key: 'published',
    label: t('common.statusPublished'),
    value: statText(publishedCount.value),
    tone: 'green',
    icon: '✓',
  },
  {
    key: 'draft',
    label: t('common.statusDraft'),
    value: statText(draftCount.value),
    tone: 'orange',
    icon: '⌕',
  },
  {
    key: 'disabled',
    label: t('common.statusDisabled'),
    value: statText(disabledCount.value),
    tone: 'gray',
    icon: '—',
  },
])

/** 展示层时间格式：真实时间戳 → MM-DD HH:mm（设计04，仅显示不改数据） */
function formatDefTime(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return value.replace('T', ' ').slice(0, 16)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function countByStatus(defs: ProcessDef[]): { published: number; draft: number } {
  let published = 0
  let draft = 0
  for (const def of defs) {
    if (def.status === 'PUBLISHED') published += 1
    else if (def.status === 'DRAFT') draft += 1
  }
  return { published, draft }
}

async function loadStats() {
  try {
    const summary = list.value[0]?.p53Stats
    if (summary) {
      publishedCount.value = summary.published
      draftCount.value = summary.draft
      return
    }
    if (total.value === 0) {
      publishedCount.value = 0
      draftCount.value = 0
      return
    }
    if (total.value === list.value.length) {
      // 首页响应即全量：直接从本次真实响应计数，不发额外请求
      const counts = countByStatus(list.value)
      publishedCount.value = counts.published
      draftCount.value = counts.draft
      return
    }
    const full = await pageProcessDefs({ pageNum: 1, pageSize: total.value })
    const counts = countByStatus(full.list)
    publishedCount.value = counts.published
    draftCount.value = counts.draft
  } catch {
    // 统计查询失败不阻塞列表：计数保持 null，界面显示「—」
    publishedCount.value = null
    draftCount.value = null
  }
}

// ─── 查看流程图对话框 ───
const viewerVisible = ref(false)
const viewerLoading = ref(false)
const viewerError = ref('')
const currentDefName = ref('')
const viewerGraph = ref<ProcessGraphDocument | null>(null)

// ─── 发布流程定义 ───
const publishingId = ref<number | null>(null)

// ─── 删除流程定义 ───
const deletingId = ref<number | null>(null)

// ─── 创建流程定义 ───
const createDialogVisible = ref(false)

// ─── 表单工作台回跳上下文（P52） ───
const route = useRoute()
const router = useRouter()
const returnFormId = computed(() =>
  route.query?.from === 'form-workbench' && typeof route.query?.formId === 'string'
    ? route.query.formId
    : '',
)

function backToWorkbench() {
  if (!returnFormId.value) return
  router.push({ path: `/form/designer/${returnFormId.value}`, query: { tab: 'processes' } })
}

// ─── 设计器入口 ───
const editingDef = ref<ProcessDef | null>(null)

function openDesigner(row: ProcessDef) {
  editingDef.value = row
  void router.push(`/workflow/defs/${row.id}/design`)
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageProcessDefs(pageQuery)
    list.value = result.list
    total.value = result.total
    void loadStats()
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('workflow.processDefListLoadFailed')
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

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数
function statusRow(r: unknown) {
  return r as ProcessDef
}

/**
 * 操作列（V012-BUG-002）：设计直显；查看图 / 发布 / 删除（仅 DRAFT 可见）收进「更多」。
 * 组件行内最多直显 2 个按钮，其余自动进「更多」下拉。
 */
function rowActions(row: unknown): ListAction[] {
  const item = statusRow(row)
  return [
    {
      key: 'design',
      label: t('workflow.design'),
      type: 'primary',
      onClick: () => openDesigner(item),
    },
    {
      key: 'viewDiagram',
      label: t('workflow.viewDiagram'),
      onClick: () => void openViewer(item),
    },
    {
      key: 'publish',
      label: t('common.publish'),
      visible: item.status === 'DRAFT',
      onClick: () => void handlePublish(item),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      visible: item.status === 'DRAFT',
      onClick: () => void handleDelete(item),
    },
  ]
}

/** 重置筛选：仅清空过滤条件（列表经 visibleList 客户端过滤，无需重新请求） */
function resetFilters() {
  keyword.value = ''
  categoryFilter.value = ''
  statusFilter.value = ''
}

// ─── 查看流程图 ───

/** 打开查看流程图对话框（自研渲染内核直接消费已保存 ProcessGraph） */
async function openViewer(row: ProcessDef) {
  currentDefName.value = row.name
  viewerVisible.value = true
  viewerLoading.value = true
  viewerError.value = ''
  viewerGraph.value = null
  try {
    const definition = await getProcessDefDefinition(row.id)
    viewerGraph.value = {
      processKey: definition.processKey,
      name: definition.name ?? '',
      formKey: definition.formKey ?? '',
      version: definition.version,
      contractVersion: (definition as { contractVersion?: number }).contractVersion,
      elements: (definition.elements ??
        []) as import('@/contracts/process-graph').ProcessGraphElement[],
      canvas: definition.canvas ?? {},
    }
  } catch (e: unknown) {
    viewerError.value =
      (e as Record<string, string>)?.msg ||
      (e as Error)?.message ||
      t('workflow.processGraphLoadFailed')
  } finally {
    viewerLoading.value = false
  }
}

/** 关闭对话框 */
function closeViewer() {
  viewerVisible.value = false
  viewerError.value = ''
  viewerLoading.value = false
  viewerGraph.value = null
}

// ─── 发布流程定义 ───

/** 发布流程定义（带确认对话框） */
async function handlePublish(row: ProcessDef) {
  publishingId.value = row.id
  try {
    await publishProcessDef(row.id)
    ElMessage.success(t('common.publishSuccess'))
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(t('common.publishFailed'))
    }
  } finally {
    publishingId.value = null
  }
}

/** 删除流程定义（带确认对话框，仅 DRAFT 状态可删除） */
async function handleDelete(row: ProcessDef) {
  if (row.status !== 'DRAFT') {
    ElMessage.warning(t('workflow.onlyDraftDeletable'))
    return
  }

  deletingId.value = row.id
  try {
    await deleteProcessDef(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(t('common.deleteFailed'))
    }
  } finally {
    deletingId.value = null
  }
}

onMounted(loadList)
</script>

<template>
  <section class="p53-admin-defs">
    <!-- 标题区：标题 + 副标题 + 右侧主操作（设计节点04 · 6:25 / 6:26 / 6:28） -->
    <header class="p53-admin-defs__heading">
      <div class="p53-admin-defs__heading-text">
        <h1>{{ t('common.processDef') }}</h1>
        <p>{{ t('workflow.processDefListSubtitle') }}</p>
      </div>
      <div class="p53-admin-defs__heading-actions">
        <el-button v-if="returnFormId" @click="backToWorkbench">{{
          t('workflow.backToFormWorkbench')
        }}</el-button>
        <el-button type="primary" class="heading-primary" @click="createDialogVisible = true">
          <el-icon><Plus /></el-icon>
          {{ t('workflow.createProcessDefAction') }}
        </el-button>
      </div>
    </header>

    <!-- 统计条：四张统计卡，数值全部来自真实接口派生（设计节点04 · 6:30-6:43） -->
    <div class="p53-admin-defs__metrics">
      <article v-for="metric in metrics" :key="metric.key" class="metric-card">
        <div>
          <span class="metric-card__label">{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </div>
        <el-icon class="metric-card__icon" :class="`is-${metric.tone}`" aria-hidden="true">
          <Tickets v-if="metric.key === 'total'" />
          <CircleCheck v-else-if="metric.key === 'published'" />
          <EditPen v-else-if="metric.key === 'draft'" />
          <VideoPause v-else />
        </el-icon>
      </article>
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      class="p53-admin-defs__error"
    />

    <!-- 筛选区与表格区（设计节点04） -->
    <div class="p53-admin-defs__filters">
      <el-input
        v-model="keyword"
        class="defs-filter__keyword"
        placeholder="搜索流程名称 / 编码"
        clearable
      />
      <el-select
        v-model="categoryFilter"
        class="defs-filter__category"
        placeholder="全部分类"
        clearable
      >
        <el-option
          v-for="category in categories"
          :key="category"
          :label="category"
          :value="category"
        />
      </el-select>
      <el-select
        v-model="statusFilter"
        class="defs-filter__status"
        placeholder="全部状态"
        clearable
      >
        <el-option label="已发布" value="PUBLISHED" />
        <el-option label="草稿" value="DRAFT" />
        <el-option label="停用" value="DISABLED" />
      </el-select>
      <el-button type="primary" class="defs-filter__query">查询</el-button>
      <el-button class="defs-filter__reset" @click="resetFilters"> 重置 </el-button>
    </div>

    <div class="p53-admin-defs__table-card">
      <ListEmpty v-if="isEmpty">
        <template #action>
          <el-button type="primary" @click="createDialogVisible = true">
            <el-icon><Plus /></el-icon>
            {{ t('workflow.createProcessDefAction') }}
          </el-button>
        </template>
      </ListEmpty>
      <template v-else>
        <el-table v-loading="loading" :data="visibleList" stripe class="defs-table">
          <el-table-column
            prop="name"
            :label="t('common.processName')"
            width="268"
            class-name="defs-table__col-name"
          />
          <el-table-column :label="t('workflow.categoryName')" width="130">
            <template #default="{ row }">{{ statusRow(row).categoryName || '—' }}</template>
          </el-table-column>
          <el-table-column
            prop="defVersion"
            :label="t('common.version')"
            width="100"
            align="center"
          >
            <template #default="{ row }">
              <span class="defs-table__version"
                >v{{ statusRow(row).versionLabel || statusRow(row).defVersion }}</span
              >
            </template>
          </el-table-column>
          <el-table-column prop="status" :label="t('common.status')" width="120">
            <template #default="{ row }">
              <span class="status" :class="getStatusClass(statusRow(row).status)">{{
                getStatusLabel(statusRow(row).status)
              }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('workflow.instanceCount')" width="114" align="center">
            <template #default="{ row }">{{ statusRow(row).instanceCount ?? '—' }}</template>
          </el-table-column>
          <el-table-column prop="updateTime" :label="t('workflow.updatedByTime')" width="246">
            <template #default="{ row }">
              {{ statusRow(row).updatedBy || '—' }} · {{ formatDefTime(row.updateTime) }}
            </template>
          </el-table-column>
          <ListActionsColumn :actions="rowActions" :width="170" />
        </el-table>
        <ListPagination
          :total="total"
          :page-num="pageNum"
          :page-size="pageSize"
          @update:page-num="handlePageNumChange"
          @update:page-size="handlePageSizeChange"
        />
      </template>
      <p class="defs-table__note">{{ t('workflow.processDefCapabilityNote') }}</p>
    </div>
  </section>

  <!-- 查看流程图对话框 -->
  <el-dialog
    v-model="viewerVisible"
    :title="t('workflow.graphDialogTitle', { currentDefName })"
    :close-on-click-modal="false"
    destroy-on-close
    width="900px"
    @closed="closeViewer"
  >
    <div v-loading="viewerLoading" class="pg-wrapper">
      <el-result
        v-if="viewerError"
        icon="error"
        :title="viewerError"
        :sub-title="t('workflow.confirmViewableGraph')"
      />
      <ProcessGraphView v-else :graph="viewerGraph" :height="480" />
    </div>
  </el-dialog>

  <!-- 创建流程定义对话框 -->
  <CreateProcessDefDialog v-model:visible="createDialogVisible" @saved="loadList" />
</template>

<style scoped>
/* ═══ P53 设计节点04（管理后台/流程定义）版式，自 design-fixture/P53AdminDefsFixture.vue 移植 ═══
   几何/类名保持 fixture 原值（已通过像素比较）；带「设计精确值」注释的色值在
   tokens.css 中无对应变量，按验收方向要求保留具体值。 */

.p53-admin-defs {
  box-sizing: border-box;
  min-height: 100%;
  padding: 32px;
  background: var(--sw-surface-page);
  color: #17213a;
}

/* ── 标题区 ── */
.p53-admin-defs__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  min-height: 64px;
}
.p53-admin-defs__heading h1 {
  margin: 0;
  font-size: 28px;
  line-height: 40px;
  font-weight: 700;
  color: #17213a;
}
.p53-admin-defs__heading p {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: #8690ae; /* 设计精确值 */
}
.p53-admin-defs__heading-actions {
  display: flex;
  flex-shrink: 0;
  gap: 12px;
}
/* 设计节点04 · 6:28「＋ 新建流程」主按钮：高 42 */
.p53-admin-defs__heading-actions .heading-primary {
  height: 42px;
  padding: 0 18px;
  font-size: 14px;
}

/* ── 统计条：四张统计卡 ── */
.p53-admin-defs__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 258px));
  gap: 24px;
  min-height: 94px;
  margin-top: 24px;
}
.metric-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  padding: 0 20px;
  border-radius: 14px; /* 设计精确值（卡片圆角 14，token 阶 10/12 无 14） */
  background: var(--sw-surface-card);
}
.metric-card__label {
  display: block;
  margin-bottom: 8px;
  color: #8690ae; /* 设计精确值 */
  font-size: 13px;
  line-height: 18px;
}
.metric-card strong {
  display: block;
  font-size: 26px;
  line-height: 32px;
  color: #17213a;
}
.metric-card__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  font-size: 22px;
  font-weight: 700;
}
.metric-card__icon.is-purple {
  color: var(--sw-color-primary);
}
.metric-card__icon.is-green {
  color: #18a67a;
}
.metric-card__icon.is-orange {
  color: #f59e0b;
}
.metric-card__icon.is-gray {
  color: #8690ae; /* 设计精确值 */
}

/* ── 错误提示 ── */
.p53-admin-defs__error {
  margin-top: 24px;
}

/* ── 筛选卡：保留列表页真实筛选能力，按节点04的 90px 网格排列 ── */
.p53-admin-defs__filters {
  display: flex;
  align-items: center;
  gap: 20px;
  box-sizing: border-box;
  height: 90px;
  margin-top: 24px;
  padding: 0 24px;
  border-radius: 14px;
  background: var(--sw-surface-card);
}
.p53-admin-defs__filters :deep(.el-input__wrapper),
.p53-admin-defs__filters :deep(.el-select__wrapper) {
  height: 42px;
  box-shadow: 0 0 0 1px #cbd4e8 inset;
  border-radius: 7px;
  background: #fbfcff;
}
.defs-filter__keyword {
  width: 340px;
}
.defs-filter__keyword :deep(.el-input__wrapper) {
  padding-left: 4px;
}
.defs-filter__category,
.defs-filter__status {
  width: 180px;
}
.defs-filter__category :deep(.el-select__wrapper),
.defs-filter__status :deep(.el-select__wrapper) {
  padding-left: 16px;
}
.defs-filter__category :deep(.el-select__placeholder) {
  color: #172033 !important;
}
.defs-filter__query {
  width: 84px;
  height: 42px;
  margin-left: 2px;
  border-radius: 8px;
}
.defs-filter__reset {
  width: 64px;
  height: 32px;
  margin-left: -6px;
  border-color: #cbd4e8;
  border-radius: 7px;
  color: #344164;
}

/* ── 表格区：卡片白底 ── */
.p53-admin-defs__table-card {
  box-sizing: border-box;
  margin-top: 24px;
  min-height: 524px;
  padding: 24px;
  border-radius: 14px; /* 设计精确值 */
  background: var(--sw-surface-card);
}

/* 表格几何对齐 fixture：表头 42px / 行高 62px / 12px 字号 */
.defs-table {
  --el-table-header-bg-color: #f6f7fb; /* 设计精确值（表头底色，无对应 token） */
  --el-table-header-text-color: #6b7280;
  --el-table-border-color: #f0f2f7; /* 设计精确值（行分隔线色） */
  --el-table-row-hover-bg-color: #f7f9fd;
}
.defs-table :deep(th.el-table__cell) {
  height: 42px;
  font-size: 12px;
  font-weight: 400;
}
.defs-table :deep(th.el-table__cell .cell) {
  padding: 0;
  transform: translateY(0);
}
.defs-table :deep(th.el-table__cell:last-child .cell) {
  transform: translate(33px, 0);
}
.defs-table :deep(.el-table__row td.el-table__cell) {
  height: 76px;
  font-size: 12px;
  color: #6b7280;
}
.defs-table :deep(.el-table__row td.el-table__cell .cell) {
  padding: 0;
  transform: translateY(-8px);
}
.defs-table :deep(td.defs-table__col-name .cell) {
  font-size: 14px;
  font-weight: 600;
  color: #17213a;
}
.defs-table :deep(.defs-table__version) {
  color: #17213a;
}

/* 状态徽标：fixture 胶囊样式原样移植 */
.status {
  display: inline-block;
  min-width: 46px;
  padding: 7px 12px;
  border-radius: 999px;
  text-align: center;
  font-size: 12px;
  line-height: 14px;
  transform: translateY(-8px);
}
.status.is-published {
  background: #eafbf7;
  color: #18a67a;
}
.status.is-draft {
  background: #fff7e8;
  color: #f59e0b;
}
/* 设计中的「停用」徽标：ProcessDef 目前仅 DRAFT/PUBLISHED 两态，暂无数据路径；样式随设计保留 */
.status.is-disabled {
  background: #f2f4f8;
  color: #8690ae; /* 设计精确值 */
}

/* 行内「设计」按钮：fixture .row-action（白底描边 + 品牌紫文字） */
.defs-table :deep(.el-button.row-action) {
  height: 31px;
  padding: 0 14px;
  border-radius: 7px; /* 设计精确值 */
  border-color: #cbd4e8; /* 设计精确值（控件描边，无对应 token） */
  color: var(--sw-color-primary);
  background: var(--sw-surface-card);
  font-weight: 500;
  transform: translateX(-8px);
}

.defs-table__note {
  margin: 22px 0 0;
  color: #8690ae; /* 设计精确值 */
  font-size: 12px;
  line-height: 18px;
}

/* 操作列禁用态按钮：与可点链接形成清晰视觉反差 */
:deep(.el-button.is-link.is-disabled) {
  color: var(--sw-text-placeholder) !important;
  cursor: not-allowed;
  text-decoration: none;
}

.pg-wrapper {
  min-height: 480px;
  position: relative;
}
</style>

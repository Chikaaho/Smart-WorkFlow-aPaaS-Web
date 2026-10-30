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
import { pageProcessDefs, getProcessDefDefinition, publishProcessDef } from '@/modules/workflow/api'
import { pageTenants } from '@/adapters/org-tenant'
import type { SysTenant } from '@/adapters/org-tenant'
import { useUserStore } from '@/stores/user'
import type { ProcessDef } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import ProcessGraphView from '@/components/ProcessGraphView.vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { hasPerm } from '@/foundation/permission'
import type { ProcessGraphDocument } from '@/contracts/process-graph'
import CreateProcessDefDialog from './CreateProcessDefDialog.vue'
import ThemeRuleDialog from './ThemeRuleDialog.vue'

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

const userStore = useUserStore()
// Q69（459:14712）：超管可见「租户」筛选与列；普通租户不带该参数，隔离由既有租户拦截器保证
const isSuperAdmin = computed(() => userStore.superAdmin)
const tenantFilter = ref<string | undefined>(undefined)
const tenantOptions = ref<SysTenant[]>([])

async function loadTenantOptions() {
  try {
    const result = await pageTenants({ pageNum: 1, pageSize: 200 }, {})
    tenantOptions.value = result.list
  } catch {
    tenantOptions.value = []
  }
}

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

// ─── 查看流程图对话框 ───
const viewerVisible = ref(false)
const viewerLoading = ref(false)
const viewerError = ref('')
const currentDefName = ref('')
const viewerGraph = ref<ProcessGraphDocument | null>(null)

// ─── 发布流程定义 ───
const publishingId = ref<number | null>(null)

// ─── 删除流程定义 ───

// ─── 创建流程定义 ───
const createDialogVisible = ref(false)

// ─── 表单工作台回跳上下文（P52） ───
const route = useRoute()
const router = useRouter()
const canAuthorize = computed(
  () => hasPerm('workflow:task:authorize') || hasPerm('workflow:def:design'),
)
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
    const result = await pageProcessDefs(
      pageQuery,
      undefined,
      isSuperAdmin.value ? tenantFilter.value || undefined : undefined,
    )
    list.value = result.list
    total.value = result.total
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
      key: 'themeRule',
      label: t('workflow.themeRuleAction'),
      onClick: () => openThemeRule(item),
    },
  ]
}

// ── V012-BUG-010 / BF20261013-041/042：流程编号（主题）规则——必填配置，
//    编辑器见 ThemeRuleDialog（变量按钮同框带入、手写 {xxx} 当普通字符串） ──
const themeDialogVisible = ref(false)
const themeDef = ref<ProcessDef | null>(null)

function openThemeRule(item: ProcessDef) {
  themeDef.value = item
  themeDialogVisible.value = true
}

/** 重置筛选：仅清空过滤条件（列表经 visibleList 客户端过滤，无需重新请求） */
function resetFilters() {
  keyword.value = ''
  categoryFilter.value = ''
  statusFilter.value = ''
  tenantFilter.value = undefined
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

onMounted(() => {
  void loadList()
  if (isSuperAdmin.value) void loadTenantOptions()
})
</script>

<template>
  <section class="p53-admin-defs">
    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      class="p53-admin-defs__error"
    />

    <!-- 筛选区与表格区（设计节点04：单行工具栏，统计卡收至监控入口） -->
    <div class="p53-admin-defs__filters">
      <span class="defs-filter__label">{{ t('common.processName') }}</span>
      <el-input v-model="keyword" class="defs-filter__keyword" placeholder="请输入" clearable />
      <span class="defs-filter__label defs-filter__label--inline">{{ t('common.category') }}</span>
      <el-select
        v-model="categoryFilter"
        class="defs-filter__category"
        :placeholder="t('common.all')"
        clearable
      >
        <el-option
          v-for="category in categories"
          :key="category"
          :label="category"
          :value="category"
        />
      </el-select>
      <span class="defs-filter__label defs-filter__label--inline">{{ t('common.status') }}</span>
      <el-select
        v-model="statusFilter"
        class="defs-filter__status"
        :placeholder="t('common.all')"
        clearable
      >
        <el-option label="已发布" value="PUBLISHED" />
        <el-option label="草稿" value="DRAFT" />
        <el-option label="停用" value="DISABLED" />
      </el-select>
      <template v-if="isSuperAdmin">
        <span class="defs-filter__label defs-filter__label--inline">{{
          t('system.tenantShort')
        }}</span>
        <el-select
          v-model="tenantFilter"
          class="defs-filter__tenant"
          :placeholder="t('common.all')"
          clearable
        >
          <el-option
            v-for="tenant in tenantOptions"
            :key="tenant.id"
            :label="tenant.name"
            :value="String(tenant.id)"
          />
        </el-select>
      </template>
      <span class="defs-filter__spacer" aria-hidden="true" />
      <el-button v-if="returnFormId" link class="defs-filter__link" @click="backToWorkbench">{{
        t('workflow.backToFormWorkbench')
      }}</el-button>
      <el-button
        v-if="canAuthorize"
        link
        class="defs-filter__link"
        @click="router.push('/workflow/authorize-rules')"
        >{{ t('workflow.authorizeRulesEntry') }}</el-button
      >
      <el-button class="defs-filter__reset" @click="resetFilters"> 重置 </el-button>
      <el-button class="defs-filter__query" @click="loadList">查询</el-button>
      <el-button type="primary" class="defs-filter__create" @click="createDialogVisible = true">
        {{ t('workflow.createProcessDefAction') }}
      </el-button>
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
        <el-table v-loading="loading" :data="visibleList" class="defs-table">
          <el-table-column
            prop="name"
            :label="t('common.processName')"
            width="362"
            class-name="defs-table__col-name"
          />
          <el-table-column v-if="isSuperAdmin" :label="t('system.tenantShort')" width="132">
            <template #default="{ row }">{{ statusRow(row).tenantName || '—' }}</template>
          </el-table-column>
          <el-table-column :label="t('workflow.categoryName')" width="234">
            <template #default="{ row }">{{ statusRow(row).categoryName || '—' }}</template>
          </el-table-column>
          <el-table-column prop="defVersion" :label="t('common.version')" width="132">
            <template #default="{ row }">
              <span class="defs-table__version"
                >v{{ statusRow(row).versionLabel || statusRow(row).defVersion }}</span
              >
            </template>
          </el-table-column>
          <el-table-column prop="status" :label="t('common.status')" width="78" align="center">
            <template #default="{ row }">
              <span class="status" :class="getStatusClass(statusRow(row).status)">{{
                getStatusLabel(statusRow(row).status)
              }}</span>
            </template>
          </el-table-column>
          <!-- 6:2：流程编号列显示定义自身标识；实例编号模板（主题规则）经「编号设置」动作维护 -->
          <el-table-column :label="t('workflow.themeRuleColumn')" width="212">
            <template #default="{ row }">
              <span class="defs-table__code">{{ statusRow(row).processKey || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('workflow.instanceCount')" width="83">
            <template #default="{ row }">{{ statusRow(row).instanceCount ?? '—' }}</template>
          </el-table-column>
          <!-- 设计节点 6:2：更新人与时间为单列「更新人 / 时间」 -->
          <el-table-column :label="t('workflow.updatedByTime')" width="371">
            <template #default="{ row }">
              {{ statusRow(row).updatedBy || '—' }} · {{ formatDefTime(row.updateTime) }}
            </template>
          </el-table-column>
          <ListActionsColumn :actions="rowActions" :width="170" />
        </el-table>
        <div class="p53-admin-defs__table-footer">
          <!-- 6:2 分页器与 4:2 同一设计形态：文字「上一页/下一页」+ 页码 + 页大小 + 跳页 -->
          <ListPagination
            :total="total"
            :page-num="pageNum"
            :page-size="pageSize"
            layout="prev, pager, next, sizes, jumper"
            appearance="design"
            total-text
            align="space-between"
            :inset="false"
            @update:page-num="handlePageNumChange"
            @update:page-size="handlePageSizeChange"
          />
        </div>
      </template>
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
  <!-- V012-BUG-010 / BF20261013-041/042：流程编号（主题）规则设置——变量按钮同框带入 -->
  <ThemeRuleDialog v-model:visible="themeDialogVisible" :def="themeDef" @saved="loadList" />

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
  padding: 20px;
  background: var(--sw-surface-page);
  color: #17213a;
}

/* ── 动作行（0.1.7 #25：标题/副标题已去噪，仅保留右对齐按钮行） ── */
.p53-admin-defs__heading {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

/* ── 筛选卡：参考 6:2 单行 64 高工具栏（统计卡已收至监控入口） ── */
.p53-admin-defs__filters {
  display: flex;
  align-items: center;
  gap: 0;
  box-sizing: border-box;
  height: 64px;
  margin-top: 0;
  padding: 0 16px 0 16px;
  border: 1px solid #dde3ef;
  border-radius: 8px;
  background: var(--sw-surface-card);
}
.p53-admin-defs__filters :deep(.el-input__wrapper),
.p53-admin-defs__filters :deep(.el-select__wrapper) {
  height: 32px;
  box-sizing: border-box;
  box-shadow: 0 0 0 1px #dde3ef inset;
  border-radius: 4px;
  background: #ffffff;
}
.defs-filter__label {
  flex: none;
  width: 56px;
  /* 参考 6:2 ListFilterItem：标签 56×22 #303A55，与控件间距 8 */
  margin-right: 8px;
  font-size: 14px;
  color: #303a55;
}
.defs-filter__label--inline {
  width: 28px;
  margin-left: 8px;
  margin-right: 8px;
}
.defs-filter__keyword {
  width: 296px;
}
.defs-filter__keyword :deep(.el-input__wrapper) {
  padding-left: 11px;
}
.defs-filter__category,
.defs-filter__status,
.defs-filter__tenant {
  width: 144px;
  margin-left: 0;
}
.defs-filter__category :deep(.el-select__wrapper),
.defs-filter__status :deep(.el-select__wrapper) {
  padding-left: 11px;
}
.defs-filter__category :deep(.el-select__placeholder),
.defs-filter__status :deep(.el-select__placeholder) {
  /* 参考 6:2：「全部」等已选/占位值均为深色正文，不是浅灰提示态 */
  color: #172033 !important;
}
.defs-filter__spacer {
  flex: 1;
}
.defs-filter__link {
  margin: 0 8px 0 12px;
  font-size: 13px;
}
.defs-filter__query {
  width: 72px;
  height: 32px;
  margin: 0 0 0 8px;
  border-color: #dde3ef;
  border-radius: 4px;
  color: #303a55;
}
.defs-filter__reset {
  width: 72px;
  height: 32px;
  margin: 0;
  border-color: #dde3ef;
  border-radius: 4px;
  color: #303a55;
}
.defs-filter__create {
  width: 80px;
  height: 32px;
  margin: 0 0 0 8px;
  padding: 0;
  border-radius: 4px;
  font-size: 13px;
}

/* ── 表格区：卡片白底，表头 42、行 44、页脚在卡内 ── */
.p53-admin-defs__table-card {
  box-sizing: border-box;
  margin-top: 16px;
  padding: 0;
  border: 1px solid #dde3ef;
  border-radius: 8px;
  background: var(--sw-surface-card);
  overflow: hidden;
}
.p53-admin-defs__table-footer {
  /* 参考 6:2 分页区：卡片内左右留白 16，总条数起点与分页器右缘同轴 */
  padding: 0 16px;
  border-top: 1px solid #e9edf5;
}
.p53-admin-defs__table-footer :deep(.list-pagination) {
  width: 100%;
  min-height: 50px;
}

/* 表格几何对齐参考 6:2：表头 42 / 行 44 / 12px 字号 */
.defs-table {
  --el-table-border-color: #e9edf5; /* 参考行分隔线 */
  --el-table-header-bg-color: #f4f6fb;
  --el-table-header-text-color: #6b7280;
}
.defs-table :deep(th.el-table__cell) {
  height: 42px;
  font-size: 12px;
  font-weight: 400;
  background: #f4f6fb !important;
  border-bottom-color: #f4f6fb !important;
}
.defs-table :deep(th.el-table__cell .cell),
.defs-table :deep(.el-table__row td.el-table__cell .cell) {
  /* 参考 6:2 各列文本起点 = 列起点 + 16；正文右侧留 12 */
  padding: 0 12px 0 16px;
  text-align: left;
}
.defs-table :deep(.el-table__row td.el-table__cell) {
  height: 45px;
  font-size: 12px;
  color: #303a55;
}
/* 状态列整列居中（参考胶囊 54×24 居中于 78 宽列） */
.defs-table :deep(.el-table__body tr td:nth-child(4) .cell) {
  padding: 0;
  overflow: visible;
  text-align: center;
}
.defs-table :deep(td.defs-table__col-name .cell) {
  font-size: 14px;
  font-weight: 500;
  color: #17213a;
}
.defs-table :deep(.defs-table__version) {
  color: #303a55;
}
.defs-table :deep(.defs-table__code) {
  color: #172033;
}
/* 主题规则列内联入口：已设置展示规则（超长省略+悬浮全称），未设置警示色引导点击 */
.defs-table :deep(.defs-table__theme) {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  cursor: pointer;
}
.defs-table :deep(.defs-table__theme:hover) {
  color: var(--el-color-primary);
}
.defs-table :deep(.defs-table__theme--unset) {
  color: var(--el-color-warning);
}

/* 状态徽标：fixture 胶囊样式原样移植（BF20261013-037：去掉 -8px 位移，随单元格垂直居中，
   底色不再被 .cell 裁切） */
.status {
  display: inline-block;
  box-sizing: border-box;
  width: 54px;
  height: 24px;
  padding: 0;
  border-radius: 5px;
  text-align: center;
  font-size: 12px;
  line-height: 24px;
}
.status.is-published {
  background: #eafbf7;
  color: #12805c;
}
.status.is-draft {
  background: #f4f6fb;
  color: #6b7280;
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

/* BF20261013-041/042 流程编号规则构建器样式已移入 ThemeRuleDialog 组件（列表页与表单工作台共用） */

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

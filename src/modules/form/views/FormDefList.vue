<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * FormDefList — 表单定义列表页（页型B）。
 *
 * 套 StandardListTemplate，接 GET /api/form/def/page 分页端点。
 * 提供「新建」「编辑」入口，跳转 form-designer 路由。
 *
 * 本页面不碰第四刀核心逻辑（draft-actions / definition-convert / FormDesigner 灰化逻辑）。
 */
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  pageFormDefs,
  updateFormVisibility,
  createFormDef,
  saveFormConfig,
  deleteFormDef,
} from '@/modules/form/api/form-def'
import { disableFormDef, enableFormDef } from '@/modules/form/api/i2-choices'
import { getFormDefStatusLabel, getFormDefStatusType } from '@/modules/form/utils/form-def-status'
import type { FormDefListItem } from '@/modules/form/api/form-def'
import type { PageQuery } from '@/contracts/common'
import { StandardListTemplate, ListActionsColumn, ListFilterItem } from '@/components/page-layout'
import UserRemoteSelect from '@/components/UserRemoteSelect.vue'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { listFormApps, getFormAppContent } from '@/modules/form/api/app-center'
import { pageTenants } from '@/adapters/org-tenant'
import type { FormApp, FormAppContent } from '@/contracts/app-center'

const router = useRouter()

// ─── 列表状态 ───

const list = ref<FormDefListItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

/* ── 左侧分类树：应用（一级分类）→ 目录（二级分类）→ 表单 ──
 * 分类来源=应用中心（应用承担原表单一级分类职责），表单归属由服务端 app_id/dir_id
 * 唯一确定（不再从事项 formKey 反查取首项）。未归属表单（存量歧义对象/旧入口未归属）
 * 归「未归属」节点。树只做导航与过滤，不改动列表分页契约。*/
const apps = ref<FormApp[]>([])
const appContents = ref<Map<string, FormAppContent>>(new Map())
const allForms = ref<FormDefListItem[]>([])
/** null=全部；'unassigned'=未归属；'app:<id>'；'dir:<id>'。 */
const selectedNodeKey = ref<string | null>(null)

interface AppTreeNode {
  key: string
  label: string
  count?: number
  children: AppTreeNode[]
  /** 有 formId 的是表单叶子（点击进设计器）。 */
  formId?: string
}

function formLeaf(def: {
  id?: string
  formId?: string
  name?: string
  formKey?: string
}): AppTreeNode {
  const formId = def.id ?? def.formId ?? ''
  return {
    key: `form:${formId}`,
    label: def.name || def.formKey || formId,
    children: [],
    formId,
  }
}

const categoryTree = computed<AppTreeNode[]>(() => {
  const nodes: AppTreeNode[] = [
    { key: 'all', label: t('form.categoryAll'), count: allForms.value.length, children: [] },
  ]
  for (const app of apps.value) {
    const content = appContents.value.get(app.id)
    const dirNodes: AppTreeNode[] = (content?.dirs ?? []).map((dir) => {
      const leaves = (dir.forms ?? []).map(formLeaf)
      return { key: `dir:${dir.id}`, label: dir.name, count: leaves.length, children: leaves }
    })
    const directLeaves = (content?.directForms ?? []).map(formLeaf)
    nodes.push({
      key: `app:${app.id}`,
      label: app.name,
      count: dirNodes.reduce((acc, d) => acc + (d.count ?? 0), 0) + directLeaves.length,
      children: [...dirNodes, ...directLeaves],
    })
  }
  const unassigned = allForms.value.filter((def) => !def.appId).map(formLeaf)
  if (unassigned.length > 0) {
    nodes.push({
      key: 'unassigned',
      label: t('form.appCenter.unassigned'),
      count: unassigned.length,
      children: unassigned,
    })
  }
  return nodes
})

/** 选中节点的表单集合：null=全部（走服务端分页）。 */
const selectedFormIds = computed<Set<string> | null>(() => {
  const key = selectedNodeKey.value
  if (!key) return null
  if (key === 'unassigned') {
    return new Set(allForms.value.filter((def) => !def.appId).map((def) => def.id))
  }
  if (key.startsWith('app:')) {
    const appId = key.slice(4)
    return new Set(allForms.value.filter((def) => def.appId === appId).map((def) => def.id))
  }
  if (key.startsWith('dir:')) {
    const dirId = key.slice(4)
    return new Set(allForms.value.filter((def) => def.dirId === dirId).map((def) => def.id))
  }
  return new Set()
})

/** 表格数据：节点过滤时用本地集合（不改变服务端分页语义）。 */
const displayList = computed(() => {
  const rows = (() => {
    const ids = selectedFormIds.value
    if (!ids) return list.value
    return allForms.value.filter((def) => ids.has(def.id)).slice(0, 200)
  })()
  const tn = tenantFilter.value
  if (!tn) return rows
  const tenantName = tenantOptions.value.find((option) => option.id === tn)?.name
  if (!tenantName) return rows
  return rows.filter((row) => (row as { tenantName?: string | null }).tenantName === tenantName)
})

const displayTotal = computed(() =>
  selectedFormIds.value ? displayList.value.length : total.value,
)

async function loadTenantOptions() {
  try {
    const page = await pageTenants({ pageNum: 1, pageSize: 100 }, {})
    tenantOptions.value = page.list.map((tn) => ({ id: String(tn.id), name: tn.name }))
  } catch {
    tenantOptions.value = []
  }
}

void loadTenantOptions()

async function loadCategoryTree() {
  try {
    const appList = await listFormApps()
    apps.value = appList
    const contents = new Map<string, FormAppContent>()
    await Promise.all(
      appList.slice(0, 100).map(async (app) => {
        try {
          contents.set(app.id, await getFormAppContent(app.id))
        } catch {
          // 单个应用内容加载失败不阻塞整棵树
        }
      }),
    )
    appContents.value = contents
    const defs = await pageFormDefs({ pageNum: 1, pageSize: 500 }, undefined, 'BUSINESS')
    allForms.value = defs.list
  } catch {
    // 应用目录不可用时不阻塞表单列表（列表仍按服务端分页展示全部表单）
  }
}

/** 树节点点击：分类/目录节点 = 过滤列表；表单叶子 = 打开设计器。 */
function onTreeNodeClick(data: AppTreeNode) {
  if (data.formId) {
    void router.push(`/form/designer/${data.formId}`)
    return
  }
  selectedNodeKey.value = data.key === 'all' ? null : data.key
  pageNum.value = 1
}

void loadCategoryTree()

/** 459:15228（执行提示17）：原租户/名称筛选——名称走服务端关键字；租户仅按行内真实字段过滤（无值即空结果） */
const keyword = ref('')
const currentKeyword = ref('')
const tenantFilter = ref<string | null>(null)
const tenantOptions = ref<Array<{ id: string; name: string }>>([])

function appNameOf(appId: string | null | undefined): string {
  if (!appId) return '—'
  return apps.value.find((a) => a.id === appId)?.name ?? '—'
}

function handleQuery() {
  currentKeyword.value = keyword.value.trim()
  pageNum.value = 1
  void loadList()
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    // BF20261013-020：本列表是「业务表单」维护面——审批意见表单归流程管理，不混入
    const result = await pageFormDefs(pageQuery, currentKeyword.value || undefined, 'BUSINESS')
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('form.defListLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

/** 展示层时间格式：ISO → YYYY-MM-DD HH:mm（仅显示，不改数据） */
function formatDateTime(value: string | null): string {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
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

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// ─── 操作 ───

/**
 * V011-BUG-014：新建表单先输入表单名称——
 * 弹窗必填校验 → createFormDef（名称随建单落库）→ 立即写入空定义（设计器
 * GET /definition 对无定义草稿返回 CONFIG_NOT_FOUND，需先落一份空 schema）→
 * 进入设计器。取消/关闭不产生任何数据。
 */
/** 新建表单：名称 + 应用归属（应用/目录可选；应用停用或目录不属于应用由服务端拒绝）。 */
const createDialogVisible = ref(false)
const createSaving = ref(false)
const createForm = reactive({ name: '', appId: '', dirId: '' })

const createDirOptions = computed(() => {
  const content = createForm.appId ? appContents.value.get(createForm.appId) : undefined
  return content?.dirs ?? []
})

function goCreate() {
  Object.assign(createForm, { name: '', appId: apps.value[0]?.id ?? '', dirId: '' })
  createDialogVisible.value = true
}

async function submitCreate() {
  const name = createForm.name.trim()
  if (!name) {
    ElMessage.warning(t('form.newFormNameRequired'))
    return
  }
  createSaving.value = true
  try {
    // formKey 是关联流程/目录绑定的稳定标识，建单时即生成（对齐设计器保存链路）
    const created = await createFormDef({
      formKey: 'form_' + Date.now().toString(36),
      name,
      appId: createForm.appId || null,
      dirId: createForm.dirId || null,
    })
    await saveFormConfig(created.id, JSON.stringify({ title: name, fields: [] }))
    ElMessage.success(t('common.draftSaved'))
    createDialogVisible.value = false
    // P52：用 path 而非 name —— 菜单动态路由与工作台静态路由不同名，
    // path 直达带 :id 的工作台路由，避免同名替换导致的参数丢失。
    void router.push(`/form/designer/${created.id}`)
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.saveFailed'))
  } finally {
    createSaving.value = false
  }
}

function goEdit(row: FormDefListItem) {
  void router.push(`/form/designer/${row.id}`)
}

const visibilityDialogVisible = ref(false)
const visibilityForm = ref<FormDefListItem | null>(null)
const visibilityUserIds = ref<Array<number | string>>([]) // 64 位 ID 以字符串承载，避免精度丢失
const visibilitySaving = ref(false)

// I2 生命周期：停用/启用（PUBLISHED ↔ DISABLED），成功后刷新列表
async function toggleLifecycleRow(r: unknown, action: 'disable' | 'enable') {
  const row = r as FormDefListItem
  try {
    if (action === 'disable') {
      await disableFormDef(row.id, '管理员停用')
      ElMessage.success(t('form.disabledNotice'))
    } else {
      await enableFormDef(row.id, '管理员启用')
      ElMessage.success(t('form.enabledNotice'))
    }
    await loadList()
  } catch (err) {
    ElMessage.error(
      err instanceof ApiError
        ? err.msg
        : action === 'disable'
          ? t('common.disableFailed')
          : t('common.enableFailed'),
    )
  }
}

// 0.1.7 #21：表单删除（软删）——任何状态可删，物理表/快照/数据保留
async function deleteRow(row: FormDefListItem) {
  try {
    await ElMessageBox.confirm(
      t('form.appCenter.deleteFormConfirm', { name: row.name }),
      t('common.deleteConfirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
      },
    )
  } catch {
    return
  }
  try {
    await deleteFormDef(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.deleteFailed'))
  }
}

function openVisibility(row: FormDefListItem) {
  visibilityForm.value = row
  try {
    const parsed = row.visibilityScope ? JSON.parse(row.visibilityScope) : null
    const ids: unknown[] = Array.isArray(parsed?.userIds) ? parsed.userIds : []
    visibilityUserIds.value = ids
      .map((id) => String(id))
      .filter((id) => /^\d+$/.test(id) && !/^0+$/.test(id))
  } catch {
    visibilityUserIds.value = []
  }
  visibilityDialogVisible.value = true
}

/** 统一操作列（V012-BUG-002）：编辑/发起范围直显；停用/启用按状态互斥显隐 */
function rowActions(r: unknown): ListAction[] {
  const row = r as FormDefListItem
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      onClick: () => goEdit(row),
    },
    {
      key: 'visibility',
      label: t('form.initiationScope'),
      onClick: () => openVisibility(row),
    },
    {
      key: 'disable',
      label: t('common.disable'),
      type: 'danger',
      visible: row.status === 'PUBLISHED',
      onClick: () => toggleLifecycleRow(row, 'disable'),
    },
    {
      key: 'enable',
      label: t('common.enable'),
      type: 'success',
      visible: row.status === 'DISABLED',
      onClick: () => toggleLifecycleRow(row, 'enable'),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      onClick: () => deleteRow(row),
    },
  ]
}

async function saveVisibility() {
  if (!visibilityForm.value) return
  const userIds = visibilityUserIds.value
  visibilitySaving.value = true
  try {
    await updateFormVisibility(visibilityForm.value.id, userIds)
    ElMessage.success(t('form.visibilityScopeSaved'))
    visibilityDialogVisible.value = false
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('form.visibilityScopeSaveFailed'))
  } finally {
    visibilitySaving.value = false
  }
}

onMounted(loadList)
</script>

<template>
  <div class="form-def-page">
    <StandardListTemplate
      appearance="design"
      :total="displayTotal"
      :page-num="pageNum"
      :page-size="pageSize"
      :empty="isEmpty"
      @update:page-num="handlePageNumChange"
      @update:page-size="handlePageSizeChange"
    >
      <!-- 筛选区（459:15228 执行提示18）：原租户/名称筛选；名称走服务端关键字 -->
      <template #filter>
        <ListFilterItem class="form-def-page__tenant-filter" :label="t('system.tenantShort')">
          <el-select v-model="tenantFilter" :placeholder="t('common.all')" clearable>
            <el-option v-for="tn in tenantOptions" :key="tn.id" :label="tn.name" :value="tn.id" />
          </el-select>
        </ListFilterItem>
        <ListFilterItem class="form-def-page__name-filter" :label="t('common.formName')">
          <el-input
            v-model="keyword"
            :placeholder="t('common.pleaseInput')"
            clearable
            @keyup.enter="handleQuery"
          />
        </ListFilterItem>
      </template>
      <template #filter-actions>
        <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
        <el-button type="primary" @click="goCreate">{{ t('form.newForm') }}</el-button>
      </template>

      <!-- 表格 -->
      <el-alert
        v-if="errorMsg"
        :title="errorMsg"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-table v-loading="loading" :data="displayList" stripe>
        <!-- 459:15228（执行提示18）：原八列表头锚点 38/195/632/868/1004/1120/1256/1472 -->
        <el-table-column width="157" show-overflow-tooltip>
          <template #header>{{ t('system.tenantName') }}</template>
          <template #default="{ row }">{{ row.tenantName || '—' }}</template>
        </el-table-column>
        <el-table-column
          prop="name"
          :label="t('common.formName')"
          width="437"
          show-overflow-tooltip
        />
        <el-table-column width="236">
          <template #header>{{ t('form.appCenter.belongApp') }}</template>
          <template #default="{ row }">{{ appNameOf(row.appId) }}</template>
        </el-table-column>
        <el-table-column width="136">
          <template #header>{{ t('form.appCenter.flowColumn') }}</template>
          <template #default>{{ '—' }}</template>
        </el-table-column>
        <el-table-column prop="status" :label="t('form.publishStatus')" width="116">
          <template #default="{ row }">
            <el-tag :type="getFormDefStatusType(row.status)" size="small">
              {{ getFormDefStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="formVersion" width="136">
          <template #header>{{ t('common.version') }}</template>
          <template #default="{ row }">v{{ row.formVersion }}</template>
        </el-table-column>
        <el-table-column prop="updateTime" width="216">
          <template #header>{{ t('common.updateTime') }}</template>
          <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
        </el-table-column>
        <!-- 444：与其余列合计 1878，恢复原八列表头锚点；三直显按钮英文不裁尾 -->
        <ListActionsColumn :actions="rowActions" :width="444" />
      </el-table>

      <!-- 空态 -->
      <template #empty-action>
        <el-button type="primary" @click="goCreate">{{ t('form.newForm') }}</el-button>
      </template>
    </StandardListTemplate>

    <!-- 分类次区：可收起，位于列表下方，不压缩主区/不遮新建 -->
    <el-collapse class="form-def-page__cats">
      <el-collapse-item :title="t('form.categoryTreeTitle')" name="cats">
        <el-tree
          :data="categoryTree"
          node-key="key"
          :props="{ label: 'label', children: 'children' }"
          :expand-on-click-node="false"
          :default-expanded-keys="['all']"
          highlight-current
          @node-click="onTreeNodeClick"
        >
          <template #default="{ data }">
            <span class="form-def-page__node">
              <span class="form-def-page__node-label">{{ data.label }}</span>
              <span v-if="data.count !== undefined" class="form-def-page__node-count">{{
                data.count
              }}</span>
            </span>
          </template>
        </el-tree>
      </el-collapse-item>
    </el-collapse>
  </div>

  <el-dialog
    v-model="visibilityDialogVisible"
    :title="t('form.startVisibilityScope')"
    width="520px"
  >
    <p v-if="visibilityForm" class="visibility-form__hint">
      {{ visibilityForm.name }}（{{ visibilityForm.formKey }}）
    </p>
    <!-- V012-BUG-019：发起范围用用户选择器（存 id 显示姓名），不再手填用户 ID -->
    <UserRemoteSelect
      v-model="visibilityUserIds"
      multiple
      :placeholder="t('form.startVisibilityPlaceholder')"
      style="width: 100%"
    />
    <template #footer>
      <el-button @click="visibilityDialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="visibilitySaving" @click="saveVisibility">{{
        t('common.save')
      }}</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="createDialogVisible" :title="t('form.newFormTitle')" width="440px">
    <el-form label-width="90px">
      <el-form-item :label="t('common.formName')" required>
        <el-input v-model="createForm.name" data-testid="def-create-name" maxlength="200" />
      </el-form-item>
      <el-form-item :label="t('form.appCenter.moveTargetApp')">
        <el-select
          v-model="createForm.appId"
          clearable
          style="width: 100%"
          @change="createForm.dirId = ''"
        >
          <el-option v-for="a in apps" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('form.appCenter.moveTargetDir')">
        <el-select v-model="createForm.dirId" clearable style="width: 100%">
          <el-option :label="t('form.appCenter.directForms')" value="" />
          <el-option v-for="d in createDirOptions" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createDialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="createSaving" @click="submitCreate">{{
        t('common.save')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-def-page {
  /* 459:15228（执行提示17）：全宽外壳——分类收进可折叠次区（浮于右上，不推列表起点） */
  position: relative;
  display: flex;
  flex-direction: column;
  /* BF20261013-052：行高取内容区高度（minmax(0,1fr)）而不是由内容撑——
     左列面板据此封顶在列高内，树比面板长时在面板内滚动（Owner：树单独面板内滚动）。 */
  grid-template-rows: minmax(0, 1fr);
  gap: 16px;
  align-items: flex-start;
  /* BF20261013-050：撑满内容区——左列据此成为整列面板，而非左上角一小块孤立卡片。
     底部留 16px：面板的底部圆角落在视口内可见（不留白则圆角贴着窗口下沿）。
     BF20261013-052：用 height（定值，由内容区高度解析）而不是 min-height——行高 `minmax(0,1fr)`
     只有在容器高度确定时才夹住面板；min-height 会被内容顶高，长树就不再面板内滚动。 */
  box-sizing: border-box;
  height: 100%;
  padding-bottom: 16px;
}

.form-def-page > * {
  min-width: 0;
}

.form-def-page__node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.form-def-page__node-count {
  color: var(--sw-text-placeholder);
  font-size: var(--sw-font-caption);
}
.visibility-form__hint {
  color: var(--sw-color-text-secondary);
  font-size: var(--sw-font-size-sm);
  margin: 0 0 12px;
}

/* 459:15228（执行提示18）：全宽外壳下分类次区落在列表下方，默认收起，不占筛选/表头 */
.form-def-page__cats {
  width: 100%;
  margin-top: 12px;
  background: #fff;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
}
.form-def-page__cats :deep(.el-collapse-item__header) {
  height: 44px;
  padding: 0 16px;
  font-size: 14px;
}
.form-def-page__cats :deep(.el-collapse-item__content) {
  padding: 0 16px 12px;
}
/* 459:15228（执行提示18）：筛选字段贴原锚点——租户 38/名 73、名称 356/输入 419 */
.form-def-page :deep(.list-filter-bar__fields) {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
}
.form-def-page :deep(.list-filter-bar__fields > *) {
  flex: 0 0 auto;
}
.form-def-page :deep(.list-filter-bar__actions) {
  margin-left: auto;
}
.form-def-page__tenant-filter {
  grid-template-columns: 29px 274px !important;
  width: max-content;
}
.form-def-page__name-filter {
  grid-template-columns: 56px 336px !important;
  width: max-content;
}
</style>

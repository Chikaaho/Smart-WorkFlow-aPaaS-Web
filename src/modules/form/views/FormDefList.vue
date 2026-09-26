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
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  pageFormDefs,
  updateFormVisibility,
  createFormDef,
  saveFormConfig,
} from '@/modules/form/api/form-def'
import { disableFormDef, enableFormDef } from '@/modules/form/api/i2-choices'
import { getFormDefStatusLabel, getFormDefStatusType } from '@/modules/form/utils/form-def-status'
import type { FormDefListItem } from '@/modules/form/api/form-def'
import type { PageQuery } from '@/contracts/common'
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  listCategories,
  queryAdminCatalogItems,
  type CatalogCategory,
  type CatalogItem,
} from '@/modules/workflow/api/oa'

const router = useRouter()

// ─── 列表状态 ───

const list = ref<FormDefListItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

// 搜索
const keyword = ref('')
const currentKeyword = ref('')

/* ── 左侧分类树：分类（多级）→ 表单 ──
 * 分类沿用流程中心事项目录（分类/事项归属在「流程归属管理」维护），
 * 表单与分类的绑定关系由事项的 formKey 反查，未绑定任何事项的表单归入「未分类」。
 * 树只做导航与过滤，不新增后端模型，不改动列表分页契约。*/
const categories = ref<CatalogCategory[]>([])
const catalogItems = ref<CatalogItem[]>([])
const allForms = ref<FormDefListItem[]>([])
/** null=全部；0=未分类；其余=分类 id。 */
const selectedCategoryId = ref<number | null>(null)

interface FormTreeLeaf {
  key: string
  label: string
  formId: string
}
interface CategoryTreeNode {
  key: string
  label: string
  categoryId: number | null
  count: number
  leaves: FormTreeLeaf[]
}

/** 表单 formKey → 分类 id（同一 formKey 取首个绑定项）。 */
const formCategoryMap = computed(() => {
  const map = new Map<string, number | null>()
  for (const item of catalogItems.value) {
    if (item.formKey && !map.has(item.formKey)) map.set(item.formKey, item.categoryId ?? 0)
  }
  return map
})

const categoryTree = computed<CategoryTreeNode[]>(() => {
  const leavesOf = (predicate: (def: FormDefListItem) => boolean): FormTreeLeaf[] =>
    allForms.value
      .filter(predicate)
      .map((def) => ({ key: `form:${def.id}`, label: def.name || def.formKey, formId: def.id }))

  const unclassified = leavesOf((def) => !formCategoryMap.value.has(def.formKey))
  const nodes: CategoryTreeNode[] = [
    {
      key: 'all',
      label: t('form.categoryAll'),
      categoryId: null,
      count: allForms.value.length,
      leaves: leavesOf(() => true),
    },
  ]
  for (const category of categories.value) {
    const leaves = leavesOf((def) => formCategoryMap.value.get(def.formKey) === category.id)
    nodes.push({
      key: `cat:${category.id}`,
      label: category.name,
      categoryId: category.id,
      count: leaves.length,
      leaves,
    })
  }
  nodes.push({
    key: 'cat:0',
    label: t('form.categoryUnclassified'),
    categoryId: 0,
    count: unclassified.length,
    leaves: unclassified,
  })
  return nodes
})

/** 当前分类选中的表单集合：null=不过滤（走服务端分页）。 */
const categoryFormIds = computed<Set<string> | null>(() => {
  const selected = selectedCategoryId.value
  if (selected === null) return null
  const node = categoryTree.value.find(
    (item) => item.key === (selected === 0 ? 'cat:0' : `cat:${selected}`),
  )
  return new Set((node?.leaves ?? []).map((leaf) => leaf.formId))
})

/** 表格数据：分类过滤时用本地集合（不改变服务端分页语义）。 */
const displayList = computed(() => {
  const ids = categoryFormIds.value
  if (!ids) return list.value
  return allForms.value.filter((def) => ids.has(def.id)).slice(0, 200)
})

const displayTotal = computed(() =>
  categoryFormIds.value ? displayList.value.length : total.value,
)

async function loadCategoryTree() {
  try {
    const [cats, items, defs] = await Promise.all([
      listCategories(),
      queryAdminCatalogItems({ pageNum: 1, pageSize: 500 }),
      pageFormDefs({ pageNum: 1, pageSize: 500 }),
    ])
    categories.value = cats
    catalogItems.value = items.list
    allForms.value = defs.list
  } catch {
    // 分类目录不可用时不阻塞表单列表（列表仍按服务端分页展示全部表单）
  }
}

function onCategorySelect(node: CategoryTreeNode) {
  selectedCategoryId.value = node.categoryId
  pageNum.value = 1
}

function onFormLeafOpen(leaf: FormTreeLeaf) {
  void router.push(`/form/designer/${leaf.formId}`)
}

/** 树节点点击：分类节点 = 过滤列表；表单叶子 = 打开设计器。 */
function onTreeNodeClick(node: CategoryTreeNode | FormTreeLeaf) {
  if ('leaves' in node) {
    onCategorySelect(node)
    return
  }
  onFormLeafOpen(node)
}

void loadCategoryTree()

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageFormDefs(pageQuery, currentKeyword.value || undefined)
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

function handleQuery() {
  currentKeyword.value = keyword.value.trim()
  pageNum.value = 1
  void loadList()
}

/** 展示层时间格式：ISO → YYYY-MM-DD HH:mm（仅显示，不改数据） */
function formatDateTime(value: string | null): string {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

function handleReset() {
  keyword.value = ''
  currentKeyword.value = ''
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

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// ─── 操作 ───

/**
 * V011-BUG-014：新建表单先输入表单名称——
 * 弹窗必填校验 → createFormDef（名称随建单落库）→ 立即写入空定义（设计器
 * GET /definition 对无定义草稿返回 CONFIG_NOT_FOUND，需先落一份空 schema）→
 * 进入设计器。取消/关闭不产生任何数据。
 */
async function goCreate() {
  let name: string
  try {
    const { value } = await ElMessageBox.prompt(t('common.formName'), t('form.newFormTitle'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      inputPlaceholder: t('common.formName'),
      inputValidator: (v: string) => (v && v.trim() ? true : t('form.newFormNameRequired')),
    })
    name = value.trim()
  } catch {
    return // 用户取消/关闭
  }
  try {
    // formKey 是关联流程/目录绑定的稳定标识，建单时即生成（对齐设计器保存链路）
    const created = await createFormDef({ formKey: 'form_' + Date.now().toString(36), name })
    await saveFormConfig(created.id, JSON.stringify({ title: name, fields: [] }))
    ElMessage.success(t('common.draftSaved'))
    // P52：用 path 而非 name —— 菜单动态路由与工作台静态路由不同名，
    // path 直达带 :id 的工作台路由，避免同名替换导致的参数丢失。
    void router.push(`/form/designer/${created.id}`)
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.saveFailed'))
  }
}

function goEdit(row: FormDefListItem) {
  void router.push(`/form/designer/${row.id}`)
}

const visibilityDialogVisible = ref(false)
const visibilityForm = ref<FormDefListItem | null>(null)
const visibilityUserIds = ref('')
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

function openVisibility(row: FormDefListItem) {
  visibilityForm.value = row
  try {
    const parsed = row.visibilityScope ? JSON.parse(row.visibilityScope) : null
    const ids = Array.isArray(parsed?.userIds) ? parsed.userIds : []
    visibilityUserIds.value = ids.join(',')
  } catch {
    visibilityUserIds.value = ''
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
  ]
}

async function saveVisibility() {
  if (!visibilityForm.value) return
  const raw = visibilityUserIds.value.trim()
  const userIds = raw ? raw.split(',').map((value) => Number(value.trim())) : []
  if (userIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    errorMsg.value = t('form.visibilityUserIdInvalid')
    return
  }
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
    <!-- 左侧分类树（分类 → 表单，多级）：点分类过滤右侧列表，点表单直接进设计器 -->
    <aside class="form-def-page__tree">
      <p class="form-def-page__tree-title">{{ t('form.categoryTreeTitle') }}</p>
      <el-tree
        :data="categoryTree"
        node-key="key"
        :props="{ label: 'label', children: 'leaves' }"
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
    </aside>
    <StandardListTemplate
      :title="t('form.managementTitle')"
      large
      :total="displayTotal"
      :page-num="pageNum"
      :page-size="pageSize"
      :empty="isEmpty"
      @update:page-num="handlePageNumChange"
      @update:page-size="handlePageSizeChange"
    >
      <!-- 工具栏：新建按钮 -->
      <template #toolbar-actions>
        <el-button type="primary" @click="goCreate">{{ t('form.newForm') }}</el-button>
      </template>

      <!-- 筛选区：名称搜索 -->
      <template #filter>
        <el-input
          v-model="keyword"
          :placeholder="t('form.searchFormPlaceholder')"
          clearable
          style="width: 240px"
          @keyup.enter="handleQuery"
        />
      </template>
      <template #filter-actions>
        <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
        <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
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
        <el-table-column prop="name" :label="t('common.formName')" min-width="180" />
        <!-- V012-BUG-015：列为 表单名称/创建时间/更新时间/发布状态（创建人待后端列表字段下发后补） -->
        <el-table-column prop="createTime" :label="t('common.createTime')" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.createTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="updateTime" :label="t('common.updateTime')" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.updateTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="t('form.publishStatus')" width="110">
          <template #default="{ row }">
            <el-tag :type="getFormDefStatusType(row.status)" size="small">
              {{ getFormDefStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <ListActionsColumn :actions="rowActions" :width="190" />
      </el-table>

      <!-- 空态 -->
      <template #empty-action>
        <el-button type="primary" @click="goCreate">{{ t('form.newForm') }}</el-button>
      </template>
    </StandardListTemplate>
  </div>

  <el-dialog
    v-model="visibilityDialogVisible"
    :title="t('form.startVisibilityScope')"
    width="520px"
  >
    <p v-if="visibilityForm" class="visibility-form__hint">
      {{ visibilityForm.name }}（{{ visibilityForm.formKey }}）
    </p>
    <el-input
      v-model="visibilityUserIds"
      :placeholder="t('form.startVisibilityPlaceholder')"
      clearable
    />
    <p class="visibility-form__hint">
      {{ t('form.initiationScopeNote') }}
    </p>
    <template #footer>
      <el-button @click="visibilityDialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="visibilitySaving" @click="saveVisibility">{{
        t('common.save')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-def-page {
  /* 用 grid 而不是 flex：右侧列表模板根元素类名不受本文件控制，
     用列轨道定位更稳（flex 下曾出现模板被挤到下方、页面看起来“崩了”）。 */
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  align-items: flex-start;
}

.form-def-page__tree {
  max-height: 100%;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: #fff;
  overflow: auto;
}

.form-def-page__tree-title {
  margin: 0 0 8px;
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-primary);
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
</style>

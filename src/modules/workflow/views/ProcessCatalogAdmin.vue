<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ProcessCatalogAdmin — 流程中心后台管理（v0.0.2 P4，管理视角）。
 *
 * 分类 CRUD（有事项归属须先解除，服务端约束）+ 事项列表（含未发布）+
 * 分类归属调整。管理身份仍受独立权限 workflow:catalog:manage 约束。
 */
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ListFilterItem, ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  queryAdminCatalogItems,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  assignItemCategory,
  type CatalogItem,
  type CatalogCategory,
} from '@/modules/workflow/api/oa'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { useWorkflowDisplayNames } from '../composables/use-workflow-display-names'

const { ensureForm, formName } = useWorkflowDisplayNames()

// ─── 分类管理 ───
const categories = ref<CatalogCategory[]>([])
const categoryLoading = ref(false)

const categoryDialogVisible = ref(false)
const categoryEditing = ref<CatalogCategory | null>(null)
const categoryForm = reactive<{ name: string; sortNo: number }>({ name: '', sortNo: 0 })
/** 278:1591：800 宽「流程分类维护」弹窗（复用既有分类查询/增改删/排序/归属能力）。 */
const categoryManageVisible = ref(false)

function onCategoryManageCommand(command: string, category: CatalogCategory) {
  if (command === 'delete') void removeCategory(category)
}

async function loadCategories() {
  categoryLoading.value = true
  try {
    categories.value = await listCategories()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.categoryLoadFailed'))
  } finally {
    categoryLoading.value = false
  }
}

function openCreateCategory() {
  categoryEditing.value = null
  categoryForm.name = ''
  categoryForm.sortNo = 0
  categoryDialogVisible.value = true
}

function openEditCategory(category: CatalogCategory) {
  categoryEditing.value = category
  categoryForm.name = category.name
  categoryForm.sortNo = category.sortNo
  categoryDialogVisible.value = true
}

async function submitCategory() {
  if (!categoryForm.name.trim()) {
    ElMessage.warning(t('workflow.categoryNameRequired'))
    return
  }
  try {
    if (categoryEditing.value) {
      await updateCategory(categoryEditing.value.id, {
        name: categoryForm.name.trim(),
        sortNo: categoryForm.sortNo,
      })
      ElMessage.success(t('workflow.categoryUpdated'))
    } else {
      await createCategory({ name: categoryForm.name.trim(), sortNo: categoryForm.sortNo })
      ElMessage.success(t('workflow.categoryCreated'))
    }
    categoryDialogVisible.value = false
    await loadCategories()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.categorySaveFailed'))
  }
}

async function removeCategory(category: CatalogCategory) {
  try {
    await ElMessageBox.confirm(
      t('workflow.deleteCategoryConfirm', { name: category.name }),
      t('common.deleteConfirmTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteCategory(category.id)
    ElMessage.success(t('workflow.categoryDeleted'))
    await loadCategories()
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.categoryDeleteFailed'))
  }
}

// ─── 事项列表 ───
const list = ref<CatalogItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')
const keyword = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await queryAdminCatalogItems(pageQuery, {
      keyword: keyword.value.trim() || undefined,
    })
    list.value = result.list
    total.value = result.total
    for (const item of result.list) void ensureForm(item.formKey)
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('workflow.catalogItemsLoadFailed')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
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

// ─── 归属调整 ───
const assignVisible = ref(false)
const assignItem = ref<CatalogItem | null>(null)
const assignCategoryId = ref<string | number | null>(null)

function openAssign(row: CatalogItem) {
  assignItem.value = row
  assignCategoryId.value = row.categoryId
  assignVisible.value = true
}

async function submitAssign() {
  if (!assignItem.value) return
  try {
    await assignItemCategory(assignItem.value.itemKey, assignCategoryId.value)
    ElMessage.success(t('workflow.itemAssignmentUpdated'))
    assignVisible.value = false
    await Promise.all([loadList(), loadCategories()])
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.itemAssignmentFailed'))
  }
}

function categoryNameOf(id: string | number | null): string {
  if (id === null) return t('workflow.uncategorized')
  return categories.value.find((c) => c.id === id)?.name ?? t('workflow.categoryFallback', { id })
}

/** 操作列（V012-BUG-002）：事项归属调整 */
function itemActions(row: unknown): ListAction[] {
  const item = row as CatalogItem
  return [
    {
      key: 'assign',
      label: t('workflow.assignment'),
      type: 'primary',
      onClick: () => openAssign(item),
    },
  ]
}

/** 分类总览操作列：编辑 / 删除 */
function categoryActions(row: unknown): ListAction[] {
  const category = row as CatalogCategory
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      type: 'primary',
      onClick: () => openEditCategory(category),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      onClick: () => void removeCategory(category),
    },
  ]
}

onMounted(() => {
  void loadCategories()
  void loadList()
})
</script>

<template>
  <StandardListTemplate
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <!-- 278:1591：明确入口，打开既有分类维护清单（不新增分类模型/权限） -->
      <el-button data-testid="category-manage-entry" @click="categoryManageVisible = true">
        {{ t('workflow.categoryManageTitle') }}
      </el-button>
      <el-button type="primary" @click="openCreateCategory">{{
        t('workflow.newCategory')
      }}</el-button>
    </template>
    <template #filter>
      <ListFilterItem :label="t('workflow.itemName')">
        <el-input
          v-model="keyword"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleSearch"
        />
      </ListFilterItem>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleSearch">{{ t('common.query') }}</el-button>
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
      <el-table-column prop="name" :label="t('workflow.itemName')" min-width="150" />
      <el-table-column prop="itemKey" :label="t('workflow.itemKey')" min-width="170" />
      <el-table-column :label="t('common.boundForm')" min-width="160">
        <template #default="{ row }">{{ formName(row?.formKey) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.category')" min-width="120">
        <template #default="{ row }">
          {{ categoryNameOf(row.categoryId) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.flowStatus')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'PUBLISHED' ? 'success' : 'info'" size="small">
            {{ row.status === 'PUBLISHED' ? t('common.statusPublished') : t('common.statusDraft') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.form')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.formPublished ? 'success' : 'warning'" size="small">
            {{ row.formPublished ? t('common.statusPublished') : t('common.statusUnpublished') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('workflow.binding')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.bindingActive ? 'success' : 'danger'" size="small">
            {{ row.bindingActive ? t('common.statusActive') : t('common.none') }}
          </el-tag>
        </template>
      </el-table-column>
      <ListActionsColumn :actions="itemActions" :width="90" />
    </el-table>
  </StandardListTemplate>

  <!-- 分类编辑 -->
  <el-dialog
    v-model="categoryDialogVisible"
    :title="categoryEditing ? t('workflow.editCategory') : t('workflow.newCategory')"
    width="420px"
  >
    <el-form label-width="80px">
      <el-form-item :label="t('common.name')">
        <el-input
          v-model="categoryForm.name"
          maxlength="100"
          :placeholder="t('common.categoryName')"
        />
      </el-form-item>
      <el-form-item :label="t('common.sort')">
        <el-input-number v-model="categoryForm.sortNo" :min="0" :max="9999" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="categoryDialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="submitCategory">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>

  <!-- 归属调整 -->
  <el-dialog v-model="assignVisible" :title="t('workflow.assignItemsTitle')" width="420px">
    <el-form label-width="80px">
      <el-form-item :label="t('workflow.item')">
        <span>{{ assignItem?.name }}</span>
      </el-form-item>
      <el-form-item :label="t('common.category')">
        <el-select
          v-model="assignCategoryId"
          clearable
          :placeholder="t('workflow.uncategorized')"
          style="width: 100%"
        >
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="assignVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="submitAssign">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>

  <!-- 分类总览（只读区，供删除入口） -->
  <div class="category-overview">
    <h4 class="category-overview__title">{{ t('workflow.categoryList') }}</h4>
    <el-table v-loading="categoryLoading" :data="categories" stripe size="small">
      <el-table-column prop="name" :label="t('common.name')" min-width="140" />
      <el-table-column prop="sortNo" :label="t('common.sort')" width="80" />
      <el-table-column prop="itemCount" :label="t('workflow.itemCount')" width="90" />
      <ListActionsColumn :actions="categoryActions" :width="120" />
    </el-table>
  </div>

  <!-- 278:1591：流程分类维护 800 宽居中清单，仅复用既有分类消费者/CRUD/排序能力 -->
  <el-dialog
    v-model="categoryManageVisible"
    class="category-manage-dialog"
    :title="t('workflow.categoryManageTitle')"
    width="800px"
    align-center
    :close-on-click-modal="false"
  >
    <el-table
      v-loading="categoryLoading"
      :data="categories"
      class="category-manage-table"
      data-testid="category-manage-table"
    >
      <el-table-column
        prop="name"
        :label="t('common.categoryName')"
        class-name="category-manage-name"
      />
      <el-table-column :label="t('common.actions')" width="124">
        <template #default="{ row }">
          <div class="category-manage-actions">
            <el-button link type="primary" @click="openEditCategory(row as CatalogCategory)">{{
              t('common.edit')
            }}</el-button>
            <el-dropdown
              trigger="click"
              popper-class="sw-op-menu"
              @command="
                (command: string) => onCategoryManageCommand(command, row as CatalogCategory)
              "
            >
              <el-button link type="primary">{{ t('common.moreActions') }}</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item disabled>
                    {{ t('common.sort') }} {{ (row as CatalogCategory).sortNo }} ·
                    {{ t('workflow.itemCount') }} {{ (row as CatalogCategory).itemCount }}
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided class="sw-op-menu__danger">
                    {{ t('common.delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <div class="category-manage__new">
      <el-button type="primary" @click="openCreateCategory">{{
        t('workflow.newCategory')
      }}</el-button>
    </div>
    <template #footer>
      <el-button @click="categoryManageVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="categoryManageVisible = false">{{
        t('common.confirm')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.category-overview {
  margin-top: 20px;
}
.category-overview__title {
  margin: 0 0 8px;
  color: var(--sw-color-primary);
  font-size: 13px;
  font-weight: 600;
}

/* 278:1591：分类维护清单——44 表头 / 45 数据行 / 操作主列 编辑+更多 */
.category-manage-table {
  border: 1px solid var(--sw-border-light, #ebeef5);
  border-radius: 6px;
}
.category-manage-table :deep(.el-table__header th) {
  height: 44px;
  background: #f4f6fb;
  color: var(--sw-text-regular, #606266);
  font-weight: 400;
  border-bottom: none;
}
.category-manage-table :deep(.el-table__body td) {
  box-sizing: border-box;
  height: 45px;
  padding: 0;
}
.category-manage-table :deep(.el-table__row) {
  height: 45px;
}
/* 278:1591（执行提示21）：仅名称表头与5条真实名称左对齐，左缘=表格内沿+16（约x602） */
.category-manage-table :deep(.category-manage-name) .cell {
  padding-left: 16px;
  line-height: 22px;
  text-align: left;
}
.category-manage-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.category-manage-actions :deep(.el-button.is-link) {
  min-width: 0;
  height: 22px;
  padding: 0;
  font-size: 13px;
}
.category-manage__new {
  margin-top: 11px;
}
.category-manage__new .el-button {
  width: 96px;
  height: 32px;
}
</style>

<style>
/* 278:1591：800 宽居中、内距 25、标题 16/24、底栏 80×32 */
.category-manage-dialog.el-dialog {
  box-sizing: border-box;
  padding: 25px;
  border: 1px solid #dde3ef;
  border-radius: 12px;
}
.category-manage-dialog .el-dialog__header {
  box-sizing: border-box;
  height: 32px;
  margin: 0 0 15px;
  padding: 4px 32px 4px 0;
}
.category-manage-dialog .el-dialog__title {
  color: #172033;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.category-manage-dialog .el-dialog__headerbtn {
  top: 25px;
  right: 25px;
  width: 32px;
  height: 32px;
}
.category-manage-dialog .el-dialog__body {
  padding: 0;
}
.category-manage-dialog .el-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  height: 32px;
  margin-top: 18px;
  padding: 0;
}
.category-manage-dialog .el-dialog__footer .el-button {
  width: 80px;
  height: 32px;
  margin: 0;
}
</style>

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
import { StandardListTemplate } from '@/components/page-layout'
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

// ─── 分类管理 ───
const categories = ref<CatalogCategory[]>([])
const categoryLoading = ref(false)

const categoryDialogVisible = ref(false)
const categoryEditing = ref<CatalogCategory | null>(null)
const categoryForm = reactive<{ name: string; sortNo: number }>({ name: '', sortNo: 0 })

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
const assignCategoryId = ref<number | null>(null)

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

function categoryNameOf(id: number | null): string {
  if (id === null) return t('workflow.uncategorized')
  return categories.value.find((c) => c.id === id)?.name ?? t('workflow.categoryFallback', { id })
}

function openAssignRow(r: unknown) {
  openAssign(r as CatalogItem)
}

function editCategoryRow(r: unknown) {
  openEditCategory(r as CatalogCategory)
}

function removeCategoryRow(r: unknown) {
  void removeCategory(r as CatalogCategory)
}

onMounted(() => {
  void loadCategories()
  void loadList()
})
</script>

<template>
  <StandardListTemplate
    :title="t('workflow.itemManagementTitle')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreateCategory">{{
        t('workflow.newCategory')
      }}</el-button>
    </template>
    <template #filter>
      <el-input
        v-model="keyword"
        :placeholder="t('workflow.itemSearchPlaceholder')"
        clearable
        style="width: 220px"
        @keyup.enter="handleSearch"
      />
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
      <el-table-column prop="formKey" :label="t('common.boundForm')" min-width="140" />
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
      <el-table-column :label="t('common.actions')" width="90" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openAssignRow(row)">{{
            t('workflow.assignment')
          }}</el-button>
        </template>
      </el-table-column>
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
      <el-table-column :label="t('common.actions')" width="140">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editCategoryRow(row)">{{
            t('common.edit')
          }}</el-button>
          <el-button size="small" link type="danger" @click="removeCategoryRow(row)">{{
            t('common.delete')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
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
</style>

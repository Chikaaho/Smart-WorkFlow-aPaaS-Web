<script setup lang="ts">
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
    ElMessage.error(err instanceof ApiError ? err.msg : '加载分类失败')
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
    ElMessage.warning('分类名称不能为空')
    return
  }
  try {
    if (categoryEditing.value) {
      await updateCategory(categoryEditing.value.id, {
        name: categoryForm.name.trim(),
        sortNo: categoryForm.sortNo,
      })
      ElMessage.success('分类已更新')
    } else {
      await createCategory({ name: categoryForm.name.trim(), sortNo: categoryForm.sortNo })
      ElMessage.success('分类已创建')
    }
    categoryDialogVisible.value = false
    await loadCategories()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '保存分类失败')
  }
}

async function removeCategory(category: CatalogCategory) {
  try {
    await ElMessageBox.confirm(
      `确认删除分类「${category.name}」？已有事项归属时须先解除归属。`,
      '删除确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteCategory(category.id)
    ElMessage.success('分类已删除')
    await loadCategories()
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '删除失败（分类下仍有事项时须先解除归属）')
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
    errorMsg.value = err instanceof ApiError ? err.msg : '加载事项列表失败'
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
    ElMessage.success('归属已调整')
    assignVisible.value = false
    await Promise.all([loadList(), loadCategories()])
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '调整归属失败')
  }
}

function categoryNameOf(id: number | null): string {
  if (id === null) return '未分类'
  return categories.value.find((c) => c.id === id)?.name ?? `分类 ${id}`
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
    title="事项管理（流程中心）"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreateCategory">新建分类</el-button>
    </template>
    <template #filter>
      <el-input
        v-model="keyword"
        placeholder="事项名称/表单标识"
        clearable
        style="width: 220px"
        @keyup.enter="handleSearch"
      />
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleSearch">查询</el-button>
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
      <el-table-column prop="name" label="事项名称" min-width="150" />
      <el-table-column prop="itemKey" label="事项标识" min-width="170" />
      <el-table-column prop="formKey" label="关联表单" min-width="140" />
      <el-table-column label="分类" min-width="120">
        <template #default="{ row }">
          {{ categoryNameOf(row.categoryId) }}
        </template>
      </el-table-column>
      <el-table-column label="流程状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'PUBLISHED' ? 'success' : 'info'" size="small">
            {{ row.status === 'PUBLISHED' ? '已发布' : '草稿' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="表单" width="100">
        <template #default="{ row }">
          <el-tag :type="row.formPublished ? 'success' : 'warning'" size="small">
            {{ row.formPublished ? '已发布' : '未发布' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="绑定" width="90">
        <template #default="{ row }">
          <el-tag :type="row.bindingActive ? 'success' : 'danger'" size="small">
            {{ row.bindingActive ? '有效' : '无' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openAssignRow(row)">归属</el-button>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>

  <!-- 分类编辑 -->
  <el-dialog
    v-model="categoryDialogVisible"
    :title="categoryEditing ? '编辑分类' : '新建分类'"
    width="420px"
  >
    <el-form label-width="80px">
      <el-form-item label="名称">
        <el-input v-model="categoryForm.name" maxlength="100" placeholder="分类名称" />
      </el-form-item>
      <el-form-item label="排序">
        <el-input-number v-model="categoryForm.sortNo" :min="0" :max="9999" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="categoryDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="submitCategory">保存</el-button>
    </template>
  </el-dialog>

  <!-- 归属调整 -->
  <el-dialog v-model="assignVisible" title="调整事项归属" width="420px">
    <el-form label-width="80px">
      <el-form-item label="事项">
        <span>{{ assignItem?.name }}</span>
      </el-form-item>
      <el-form-item label="分类">
        <el-select v-model="assignCategoryId" clearable placeholder="未分类" style="width: 100%">
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="assignVisible = false">取消</el-button>
      <el-button type="primary" @click="submitAssign">保存</el-button>
    </template>
  </el-dialog>

  <!-- 分类总览（只读区，供删除入口） -->
  <div class="category-overview">
    <h4 class="category-overview__title">分类列表</h4>
    <el-table v-loading="categoryLoading" :data="categories" stripe size="small">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="sortNo" label="排序" width="80" />
      <el-table-column prop="itemCount" label="事项数" width="90" />
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editCategoryRow(row)">编辑</el-button>
          <el-button size="small" link type="danger" @click="removeCategoryRow(row)"
            >删除</el-button
          >
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
  color: var(--sw-color-primary, #7e306b);
  font-size: 13px;
  font-weight: 600;
}
</style>

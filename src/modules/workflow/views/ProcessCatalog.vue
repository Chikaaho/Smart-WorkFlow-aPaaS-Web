<script setup lang="ts">
/**
 * ProcessCatalog — 流程中心（v0.0.2 P4，前台普通视角）。
 *
 * 按分类 + 关键词浏览本人可发起的事项；分类聚合数量仅来自服务端可见集，
 * 不泄漏不可见事项。选择事项即进入关联表单（绑定由服务端解析）。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  queryCatalogItems,
  queryCategoryCounts,
  listPortalCategories,
  type CatalogItem,
  type CatalogCategory,
} from '@/modules/workflow/api/oa'
import { ApiError } from '@/foundation/request'

const router = useRouter()

const items = ref<CatalogItem[]>([])
const total = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const keyword = ref('')
// '' = 全部；0 = 未分类；其余为分类 id
const activeCategory = ref<number | ''>('')

const categories = ref<CatalogCategory[]>([])
const counts = ref<Record<string, number>>({})

const isEmpty = computed(() => !loading.value && !errorMsg.value && items.value.length === 0)

function categoryLabel(id: number | null): string {
  if (id === null) return '未分类'
  return categories.value.find((c) => c.id === id)?.name ?? `分类 ${id}`
}

function itemCountOf(categoryId: number | ''): number {
  if (categoryId === '') return total.value
  const key = String(categoryId)
  return counts.value[key] ?? 0
}

async function loadCatalog() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [page, categoryList] = await Promise.all([
      queryCatalogItems(
        { pageNum: 1, pageSize: 60 },
        {
          keyword: keyword.value.trim() || undefined,
          categoryId: activeCategory.value === '' ? undefined : Number(activeCategory.value),
        },
      ),
      listPortalCategories(),
    ])
    items.value = page.list
    total.value = page.total
    categories.value = categoryList
    counts.value = await queryCategoryCounts()
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : '加载流程中心失败'
  } finally {
    loading.value = false
  }
}

function selectCategory(id: number | '') {
  activeCategory.value = id
  void loadCatalog()
}

/** 选择事项即进入关联表单填报（服务端解析唯一合法绑定）。 */
function openItem(item: CatalogItem) {
  void router.push(`/form/form-render/${item.formKey}`)
}

onMounted(loadCatalog)
</script>

<template>
  <div class="catalog-page">
    <header class="catalog-page__header">
      <h2 class="catalog-page__title">流程中心</h2>
      <p class="catalog-page__subtitle">选择业务事项，进入关联表单发起申请</p>
    </header>

    <div class="catalog-page__toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索事项名称/表单标识"
        clearable
        style="width: 260px"
        @keyup.enter="loadCatalog"
        @clear="loadCatalog"
      />
      <el-button type="primary" @click="loadCatalog">搜索</el-button>
    </div>

    <div class="catalog-page__categories">
      <el-tag
        class="catalog-page__category"
        :type="activeCategory === '' ? 'primary' : 'info'"
        :effect="activeCategory === '' ? 'dark' : 'plain'"
        @click="selectCategory('')"
      >
        全部（{{ itemCountOf('') }}）
      </el-tag>
      <el-tag
        v-for="category in categories"
        :key="category.id"
        class="catalog-page__category"
        :type="activeCategory === category.id ? 'primary' : 'info'"
        :effect="activeCategory === category.id ? 'dark' : 'plain'"
        @click="selectCategory(category.id)"
      >
        {{ category.name }}（{{ itemCountOf(category.id) }}）
      </el-tag>
      <el-tag
        class="catalog-page__category"
        :type="activeCategory === 0 ? 'primary' : 'info'"
        :effect="activeCategory === 0 ? 'dark' : 'plain'"
        @click="selectCategory(0)"
      >
        未分类（{{ itemCountOf(0) }}）
      </el-tag>
    </div>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <div v-loading="loading" class="catalog-page__grid">
      <el-empty v-if="isEmpty" description="暂无可发起的事项" />
      <button
        v-for="item in items"
        :key="item.itemKey"
        class="catalog-card"
        type="button"
        @click="openItem(item)"
      >
        <span class="catalog-card__name">{{ item.name }}</span>
        <span class="catalog-card__meta">
          <el-tag size="small" type="info">{{ categoryLabel(item.categoryId) }}</el-tag>
          <span class="catalog-card__form">{{ item.formKey }}</span>
        </span>
        <span class="catalog-card__action">去填报 →</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.catalog-page {
  max-width: 960px;
  margin: 0 auto;
}
.catalog-page__title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--sw-color-text-primary, #303133);
}
.catalog-page__subtitle {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--sw-color-text-secondary, #909399);
}
.catalog-page__toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.catalog-page__categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}
.catalog-page__category {
  cursor: pointer;
}
.catalog-page__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  min-height: 120px;
}
.catalog-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px 20px;
  text-align: left;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  box-shadow: var(--sw-shadow-card, 0 1px 8px rgba(0, 0, 0, 0.04));
  cursor: pointer;
  transition: border-color 0.2s ease;
}
.catalog-card:hover {
  border-color: var(--sw-color-primary, #7e306b);
}
.catalog-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-color-text-primary, #303133);
}
.catalog-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.catalog-card__form {
  font-size: 12px;
  color: var(--sw-color-text-secondary, #909399);
}
.catalog-card__action {
  font-size: 13px;
  color: var(--sw-color-primary, #7e306b);
}
</style>

<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
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
  if (id === null) return t('workflow.uncategorized')
  return categories.value.find((c) => c.id === id)?.name ?? t('workflow.categoryFallback', { id })
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
    errorMsg.value = err instanceof ApiError ? err.msg : t('workflow.processCenterLoadFailed')
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
      <h2 class="catalog-page__title">{{ t('workflow.processCenter') }}</h2>
      <p class="catalog-page__subtitle">{{ t('workflow.catalogSubtitle') }}</p>
    </header>

    <div class="catalog-page__toolbar">
      <el-input
        v-model="keyword"
        class="catalog-page__search"
        :placeholder="t('workflow.searchCatalogPlaceholder')"
        clearable
        @keyup.enter="loadCatalog"
        @clear="loadCatalog"
      />
      <el-button type="primary" @click="loadCatalog">{{ t('common.search') }}</el-button>
      <span class="catalog-page__count">{{ t('catalog.countHint', { count: total }) }}</span>
    </div>

    <div class="catalog-page__categories" role="tablist" :aria-label="t('workflow.processCenter')">
      <button
        type="button"
        class="catalog-chip"
        :class="{ 'is-active': activeCategory === '' }"
        @click="selectCategory('')"
      >
        {{ t('workflow.catalogAllWithCount', { count: itemCountOf('') }) }}
      </button>
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="catalog-chip"
        :class="{ 'is-active': activeCategory === category.id }"
        @click="selectCategory(category.id)"
      >
        {{ category.name }}（{{ itemCountOf(category.id) }}）
      </button>
      <button
        type="button"
        class="catalog-chip"
        :class="{ 'is-active': activeCategory === 0 }"
        @click="selectCategory(0)"
      >
        {{ t('workflow.catalogUncategorizedWithCount', { count: itemCountOf(0) }) }}
      </button>
    </div>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      class="catalog-page__alert"
    />

    <div v-loading="loading" class="catalog-page__grid">
      <el-empty v-if="isEmpty" :description="t('workflow.noCatalogItems')" />
      <div v-for="(item, index) in items" :key="item.itemKey" class="catalog-card">
        <div class="catalog-card__head">
          <span
            class="catalog-card__icon"
            :class="{ 'catalog-card__icon--alt': index % 2 === 1 }"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M7 3h8l4 4v14H7z" stroke-linejoin="round" />
              <path d="M15 3v4h4M10 12h6M10 16h6" stroke-linecap="round" />
            </svg>
          </span>
          <span class="catalog-card__name">{{ item.name }}</span>
        </div>
        <span class="catalog-card__meta">
          <span class="catalog-card__category">{{ categoryLabel(item.categoryId) }}</span>
          <span class="catalog-card__form">{{ item.formKey }}</span>
        </span>
        <button type="button" class="catalog-card__launch" @click="openItem(item)">
          {{ t('catalog.launch') }}
        </button>
      </div>
    </div>

    <p class="catalog-page__note">{{ t('catalog.permissionNote') }}</p>
  </div>
</template>

<style scoped>
.catalog-page {
  max-width: 1152px;
  padding: 24px 32px 32px;
  margin: 0 auto;
}
.catalog-page__title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  color: var(--sw-text-primary);
}
.catalog-page__subtitle {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.catalog-page__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 16px 20px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
}
.catalog-page__search {
  max-width: 360px;
}
.catalog-page__count {
  margin-left: auto;
  font-size: 13px;
  color: var(--sw-text-secondary);
  white-space: nowrap;
}
.catalog-page__categories {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}
.catalog-chip {
  padding: 7px 16px;
  border: 1px solid var(--sw-border-base);
  border-radius: 999px;
  background: var(--sw-surface-card);
  font-size: 13px;
  color: var(--sw-text-regular);
  cursor: pointer;
  transition: all 0.15s ease;
}
.catalog-chip:hover {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}
.catalog-chip.is-active {
  border-color: var(--sw-color-primary);
  background: var(--sw-color-primary);
  color: #ffffff;
  font-weight: 500;
}
.catalog-page__alert {
  margin-bottom: 12px;
}
.catalog-page__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  min-height: 120px;
}
.catalog-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  transition: border-color 0.15s ease;
}
.catalog-card:hover {
  border-color: var(--sw-color-primary);
}
.catalog-card__icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: var(--sw-radius-base);
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
}
.catalog-card__icon--alt {
  background: var(--sw-info-bg);
  color: var(--sw-info);
}
.catalog-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.catalog-card__icon svg {
  width: 18px;
  height: 18px;
}
.catalog-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.catalog-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.catalog-card__category {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--sw-fill-base);
}
.catalog-card__form {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-card__launch {
  align-self: flex-end;
  margin-top: auto;
  padding: 7px 18px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: var(--sw-color-primary);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.catalog-card__launch:hover {
  background: var(--sw-color-primary-dark);
}
.catalog-page__note {
  margin: 16px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
</style>

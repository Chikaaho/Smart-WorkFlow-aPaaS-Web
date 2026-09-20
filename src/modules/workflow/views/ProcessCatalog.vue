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

function resetFilter(): void {
  keyword.value = ''
  activeCategory.value = ''
  void loadCatalog()
}

/** 结果区标题：全部流程 / 当前分类名 · N 个可发起（P53 设计节点21/22-26）。 */
const resultTitle = computed(() => {
  const name =
    activeCategory.value === ''
      ? t('catalog.allProcesses')
      : (categories.value.find((c) => c.id === activeCategory.value)?.name ??
        t('workflow.uncategorized'))
  return t('catalog.resultTitle', { name, count: total.value })
})

/** 图标交替色：按 formKey 稳定交替，避免数据刷新后跳变。 */
function catalogIconTone(item: CatalogItem): 'primary' | 'info' | 'success' | 'purple' {
  const categoryId = Number(item.categoryId)
  if (categoryId === 101 || categoryId === 102) return 'info'
  if (categoryId === 104) return 'success'
  if (categoryId === 105) return 'purple'
  return 'primary'
}

/** 卡片 meta 行：分类 · 版本（可选）· 可发起。 */
function itemMeta(item: CatalogItem): string {
  const parts = [categoryLabel(item.categoryId)]
  if (item.version) parts.push(item.version)
  parts.push(t('catalog.canLaunch'))
  return parts.join(' · ')
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
      <div class="catalog-page__toolbar-row">
        <el-input
          v-model="keyword"
          class="catalog-page__search"
          :placeholder="t('workflow.searchCatalogPlaceholder')"
          clearable
          @keyup.enter="loadCatalog"
          @clear="loadCatalog"
        />
        <el-button type="primary" class="catalog-page__query" @click="loadCatalog">{{
          t('common.query')
        }}</el-button>
        <el-button class="catalog-page__reset" @click="resetFilter">{{
          t('common.reset')
        }}</el-button>
        <span class="catalog-page__count">{{ t('catalog.countHint', { count: total }) }}</span>
      </div>
      <div
        class="catalog-page__categories"
        role="tablist"
        :aria-label="t('workflow.processCenter')"
      >
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
          {{ category.name }} {{ itemCountOf(category.id) }}
        </button>
        <button
          v-if="itemCountOf(0) > 0"
          type="button"
          class="catalog-chip"
          :class="{ 'is-active': activeCategory === 0 }"
          @click="selectCategory(0)"
        >
          {{ t('workflow.catalogUncategorizedWithCount', { count: itemCountOf(0) }) }}
        </button>
      </div>
    </div>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      class="catalog-page__alert"
    />

    <h3 class="catalog-page__result-title">{{ resultTitle }}</h3>

    <div v-loading="loading" class="catalog-page__grid">
      <el-empty v-if="isEmpty" :description="t('workflow.noCatalogItems')" />
      <div v-for="item in items" :key="item.itemKey" class="catalog-card">
        <div class="catalog-card__head">
          <span
            class="catalog-card__icon"
            :class="`catalog-card__icon--tone-${catalogIconTone(item)}`"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M7 3h8l4 4v14H7z" stroke-linejoin="round" />
              <path d="M15 3v4h4M10 12h6M10 16h6" stroke-linecap="round" />
            </svg>
          </span>
          <span class="catalog-card__name">{{ item.name }}</span>
        </div>
        <p class="catalog-card__desc">{{ item.description ?? '' }}</p>
        <span class="catalog-card__meta">{{ itemMeta(item) }}</span>
        <div class="catalog-card__actions">
          <span v-if="item.lastUsedAt" class="catalog-card__last-used">{{
            t('catalog.lastUsed', { date: item.lastUsedAt })
          }}</span>
          <button type="button" class="catalog-card__launch" @click="openItem(item)">
            {{ t('catalog.launch') }}
          </button>
        </div>
      </div>
    </div>

    <p class="catalog-page__note">{{ t('catalog.permissionNote') }}</p>
  </div>
</template>

<style scoped>
/* P53 设计节点21/22-26：内容区 1152 宽、顶部 28 起；筛选卡 132 高双行、卡片 368×232。 */
.catalog-page {
  max-width: 1152px;
  padding: 28px 32px 32px;
  margin: 0 auto;
}
.catalog-page__title {
  margin: 0;
  font-size: 24px;
  line-height: 35px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.catalog-page__subtitle {
  margin: 6px 0 20px;
  font-size: 13px;
  line-height: 19px;
  color: var(--sw-text-secondary);
}
.catalog-page__toolbar {
  margin-bottom: 16px;
  padding: 19px 21px 25px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
}
.catalog-page__toolbar-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.catalog-page__search {
  flex: 0 0 auto;
  width: 680px;
  max-width: 100%;
}
.catalog-page__search :deep(.el-input__wrapper) {
  background: #f8fafe;
}
.catalog-page__search :deep(input::placeholder) {
  color: #a1aabe;
}
.catalog-page__query {
  width: 96px;
  height: 34px;
}
.catalog-page__reset {
  width: 80px;
  height: 34px;
  /* 设计（节点21/22）：查询→重置文字起点间距 100px，EP 默认钮距 12px 偏大 11px */
  margin-left: 1px;
  color: #17213a;
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
  gap: 12px;
  /* 设计（节点21/22）：分类行顶 y=247，运行实测高 5px */
  margin-top: 21px;
}
.catalog-chip {
  min-width: 130px;
  height: 32px;
  padding: 0 18px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-card);
  font-size: 13px;
  color: var(--sw-text-regular);
  text-align: center;
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
.catalog-page__result-title {
  /* 设计（节点21）：结果标题行高 40（320..360），上下各 16 */
  margin: 16px 0;
  font-size: 15px;
  line-height: 40px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.catalog-page__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px 24px;
  min-height: 120px;
}
.catalog-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 232px;
  padding: 21px 18px 21px 21px;
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
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: var(--sw-radius-base);
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
}
.catalog-card__icon--tone-info {
  background: var(--sw-info-bg);
  color: #20b8cd;
}
.catalog-card__icon--tone-success {
  background: var(--sw-info-bg);
  color: #18a67a;
}
.catalog-card__icon--tone-purple {
  background: var(--sw-color-primary-soft);
  color: #8b5cf6;
}
.catalog-card__head {
  display: flex;
  align-items: center;
  /* 设计（节点21）：标题区 277 起、图标 24、间距 8 → 文字 x=310 */
  gap: 8px;
  margin-top: 9px;
}
.catalog-card__icon svg {
  width: 18px;
  height: 18px;
}
.catalog-card__name {
  font-size: 17px;
  line-height: 25px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.catalog-card__desc {
  margin: 26px 0 0;
  min-height: 38px;
  font-size: 13px;
  line-height: 19px;
  color: var(--sw-text-regular);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.catalog-card__meta {
  margin-top: 19px;
  font-size: 12px;
  line-height: 16px;
  color: var(--sw-text-secondary);
}
.catalog-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}
.catalog-card__last-used {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.catalog-card__launch {
  flex: 0 0 auto;
  width: 104px;
  height: 34px;
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

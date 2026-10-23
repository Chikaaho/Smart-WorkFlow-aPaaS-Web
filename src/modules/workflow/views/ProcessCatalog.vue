<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ProcessCatalog — 流程中心（v0.0.2 P4；V012-BUG-009 改版）。
 *
 * 左侧分类树（全部/分类/未分类，带可见计数）+ 右侧流程列表；
 * 收藏星标（最近收藏置顶）；常用流程 Top5（租户内发起总量）；最近使用 Top5
 * （本人最近发起去重）；分类维护入口按 workflow:catalog:manage 权限呈现。
 * 分类聚合数量仅来自服务端可见集，不泄漏不可见事项。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  queryCatalogItems,
  queryCategoryCounts,
  queryCatalogItem,
  listPortalCategories,
  listMyFavorites,
  favoriteProcess,
  unfavoriteProcess,
  frequentlyStarted,
  recentlyUsed,
  type CatalogItem,
  type CatalogCategory,
  type FavoriteItem,
} from '@/modules/workflow/api/oa'
import { ApiError } from '@/foundation/request'
import { CategorySidebar, ListPagination } from '@/components/page-layout'

const router = useRouter()

const items = ref<CatalogItem[]>([])
const total = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const keyword = ref('')
const pageNum = ref(1)
const pageSize = ref(20)
// '' = 全部；0 = 未分类；其余为分类 id
const activeCategory = ref<number | ''>('')

const categories = ref<CatalogCategory[]>([])
const counts = ref<Record<string, number>>({})

// ─── 收藏 / 常用 / 最近使用（V012-BUG-009） ───
const favorites = ref<FavoriteItem[]>([])
const frequentItems = ref<FavoriteItem[]>([])
const recentItems = ref<FavoriteItem[]>([])
const toggling = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && items.value.length === 0)

const favoriteKeys = computed(() => new Set(favorites.value.map((f) => f.processKey)))

/** 列表排序：收藏置顶（最近收藏在前），其余保持 update 序。 */
const orderedItems = computed(() => {
  const pinned: CatalogItem[] = []
  const rest: CatalogItem[] = []
  for (const item of items.value) {
    ;(favoriteKeys.value.has(item.itemKey) ? pinned : rest).push(item)
  }
  return [...pinned, ...rest]
})

/** V012-BUG-009 列表化：按分类分组（树序在前、未分类殿后），组内保持收藏置顶序。 */
const groupedItems = computed(() => {
  const byId = new Map<number | null, CatalogItem[]>()
  for (const item of orderedItems.value) {
    const key = item.categoryId
    if (!byId.has(key)) byId.set(key, [])
    byId.get(key)!.push(item)
  }
  const groups: Array<{ id: number | null; name: string; items: CatalogItem[] }> = []
  for (const category of categories.value) {
    const list = byId.get(category.id)
    if (list) groups.push({ id: category.id, name: category.name, items: list })
  }
  const uncategorized = byId.get(null)
  if (uncategorized)
    groups.push({ id: null, name: t('workflow.uncategorized'), items: uncategorized })
  return groups
})

function itemCountOf(categoryId: number | ''): number {
  if (categoryId === '') return total.value
  const key = String(categoryId)
  return counts.value[key] ?? 0
}

function resetFilter(): void {
  keyword.value = ''
  activeCategory.value = ''
  pageNum.value = 1
  void loadCatalog()
}

/** 图标交替色：按 formKey 稳定交替，避免数据刷新后跳变。 */
function catalogIconTone(item: CatalogItem): 'primary' | 'info' | 'success' | 'purple' {
  const categoryId = Number(item.categoryId)
  if (categoryId === 101 || categoryId === 102) return 'info'
  if (categoryId === 104) return 'success'
  if (categoryId === 105) return 'purple'
  return 'primary'
}

async function loadCatalog() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [page, categoryList] = await Promise.all([
      queryCatalogItems(
        { pageNum: pageNum.value, pageSize: pageSize.value },
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

async function loadUsageSections() {
  try {
    const [favs, freq, recent] = await Promise.all([
      listMyFavorites(),
      frequentlyStarted(5),
      recentlyUsed(5),
    ])
    favorites.value = favs
    frequentItems.value = freq
    recentItems.value = recent
  } catch {
    // 收藏/常用/最近使用加载失败不阻塞目录主列表
  }
}

function selectCategory(id: number | '') {
  activeCategory.value = id
  pageNum.value = 1
  void loadCatalog()
}

function searchCatalog() {
  pageNum.value = 1
  void loadCatalog()
}

function handlePageNumChange(value: number) {
  pageNum.value = value
  void loadCatalog()
}

function handlePageSizeChange(value: number) {
  pageSize.value = value
  pageNum.value = 1
  void loadCatalog()
}

/** 收藏/取消收藏（幂等；成功后刷新收藏区与置顶排序）。 */
async function toggleFavorite(item: CatalogItem) {
  if (toggling.value === item.itemKey) return
  toggling.value = item.itemKey
  try {
    if (favoriteKeys.value.has(item.itemKey)) {
      await unfavoriteProcess(item.itemKey)
      favorites.value = favorites.value.filter((f) => f.processKey !== item.itemKey)
      ElMessage.success(t('catalog.unfavorited'))
    } else {
      await favoriteProcess(item.itemKey, item.name)
      favorites.value = [{ processKey: item.itemKey, name: item.name }, ...favorites.value]
      ElMessage.success(t('catalog.favorited'))
    }
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('catalog.favoriteFailed'))
  } finally {
    toggling.value = ''
  }
}

/** 选择事项即进入关联表单填报（服务端解析唯一合法绑定）。 */
function openItem(item: CatalogItem) {
  // V012-BUG-012：携带 process 参数以在发起页下方渲染真实流程图
  void router.push({ path: `/form/form-render/${item.formKey}`, query: { process: item.itemKey } })
}

/** 常用/最近使用条目点击：经目录详情解析 formKey 后进入。 */
async function openByKey(entry: FavoriteItem) {
  try {
    const item = await queryCatalogItem(entry.processKey)
    if (item?.formKey) {
      void router.push(`/form/form-render/${item.formKey}`)
      return
    }
  } catch {
    // 不可见/已下线条目走提示
  }
  ElMessage.info(t('catalog.itemUnavailable'))
}

onMounted(() => {
  void loadCatalog()
  void loadUsageSections()
})
</script>

<template>
  <div class="catalog-page">
    <!-- 0.1.7 #25：左上角标题/描述为噪音，已去除——分类树与流程列表即页首 -->

    <!-- V012-BUG-009：左分类树 + 右列表 -->
    <div class="catalog-layout">
      <CategorySidebar
        class="catalog-tree"
        sticky
        role="tree"
        :aria-label="t('workflow.processCenter')"
      >
        <button
          type="button"
          class="catalog-tree__item"
          :class="{ 'is-active': activeCategory === '' }"
          @click="selectCategory('')"
        >
          <span>{{ t('workflow.catalogAllWithCount', { count: itemCountOf('') }) }}</span>
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          class="catalog-tree__item"
          :class="{ 'is-active': activeCategory === category.id }"
          @click="selectCategory(category.id)"
        >
          <span>{{ category.name }}</span>
          <span class="catalog-tree__count">{{ itemCountOf(category.id) }}</span>
        </button>
        <button
          v-if="itemCountOf(0) > 0"
          type="button"
          class="catalog-tree__item"
          :class="{ 'is-active': activeCategory === 0 }"
          @click="selectCategory(0)"
        >
          <span>{{ t('workflow.uncategorized') }}</span>
          <span class="catalog-tree__count">{{ itemCountOf(0) }}</span>
        </button>
      </CategorySidebar>

      <div class="catalog-main">
        <div class="catalog-page__toolbar">
          <div class="catalog-page__toolbar-row">
            <el-input
              v-model="keyword"
              class="catalog-page__search"
              :placeholder="t('workflow.searchCatalogPlaceholder')"
              clearable
              @keyup.enter="searchCatalog"
              @clear="searchCatalog"
            />
            <el-button type="primary" class="catalog-page__query" @click="searchCatalog">{{
              t('common.query')
            }}</el-button>
            <el-button class="catalog-page__reset" @click="resetFilter">{{
              t('common.reset')
            }}</el-button>
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

        <div class="catalog-sections">
          <!-- 常用流程 Top5（租户内发起总量） -->
          <section class="catalog-section">
            <h3 class="catalog-section__title">{{ t('catalog.frequentlyStarted') }}</h3>
            <div v-if="frequentItems.length" class="catalog-section__chips">
              <button
                v-for="(entry, index) in frequentItems"
                :key="entry.processKey"
                type="button"
                class="catalog-mini"
                @click="openByKey(entry)"
              >
                <span class="catalog-mini__rank">{{ index + 1 }}</span>
                <span class="catalog-mini__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M7 3h8l4 4v14H7z" stroke-linejoin="round" />
                    <path d="M15 3v4h4M10 12h6M10 16h6" stroke-linecap="round" />
                  </svg>
                </span>
                <span class="catalog-mini__name">{{ entry.name }}</span>
              </button>
            </div>
            <p v-else class="catalog-section__empty">{{ t('workflow.noCatalogItems') }}</p>
          </section>

          <!-- 最近使用 Top5（本人最近发起） -->
          <section class="catalog-section">
            <h3 class="catalog-section__title">{{ t('catalog.recentlyUsed') }}</h3>
            <div v-if="recentItems.length" class="catalog-section__chips">
              <button
                v-for="entry in recentItems"
                :key="entry.processKey"
                type="button"
                class="catalog-mini"
                @click="openByKey(entry)"
              >
                <span class="catalog-mini__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M7 3h8l4 4v14H7z" stroke-linejoin="round" />
                    <path d="M15 3v4h4M10 12h6M10 16h6" stroke-linecap="round" />
                  </svg>
                </span>
                <span class="catalog-mini__name">{{ entry.name }}</span>
              </button>
            </div>
            <p v-else class="catalog-section__empty">{{ t('workflow.noCatalogItems') }}</p>
          </section>
        </div>

        <!-- V012-BUG-009 复开：流程用列表不用卡片——分类分组带 + 多列「图标+名称」条目（参考蓝凌） -->
        <div v-loading="loading" class="catalog-list">
          <el-empty v-if="isEmpty" :description="t('workflow.noCatalogItems')" />
          <section v-for="group in groupedItems" :key="String(group.id)" class="catalog-group">
            <div class="catalog-group__head">
              <span class="catalog-group__name">{{ group.name }}</span>
              <span class="catalog-group__count">{{ group.items.length }}</span>
            </div>
            <div class="catalog-group__grid">
              <div
                v-for="item in group.items"
                :key="item.itemKey"
                class="catalog-item"
                :title="item.description ?? ''"
                @click="openItem(item)"
              >
                <span
                  class="catalog-item__icon"
                  :class="`catalog-item__icon--tone-${catalogIconTone(item)}`"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M7 3h8l4 4v14H7z" stroke-linejoin="round" />
                    <path d="M15 3v4h4M10 12h6M10 16h6" stroke-linecap="round" />
                  </svg>
                </span>
                <span class="catalog-item__name">{{ item.name }}</span>
                <button
                  type="button"
                  class="catalog-item__star"
                  :class="{ 'is-active': favoriteKeys.has(item.itemKey) }"
                  :aria-label="
                    favoriteKeys.has(item.itemKey) ? t('catalog.unfavorite') : t('catalog.favorite')
                  "
                  :disabled="toggling === item.itemKey"
                  @click.stop="toggleFavorite(item)"
                >
                  ★
                </button>
              </div>
            </div>
          </section>
        </div>
        <ListPagination
          :total="total"
          :page-num="pageNum"
          :page-size="pageSize"
          :page-sizes="[20, 40, 60, 100]"
          appearance="design"
          align="space-between"
          layout="prev, pager, next, sizes, jumper"
          total-text
          @update:page-num="handlePageNumChange"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* P53 设计节点21/22-26 基础上 V012-BUG-009 改双栏：左分类树 240 + 右内容。 */
.catalog-page {
  /* V012-BUG-009 复开：内容铺满内容区，消除宽屏左右大留白 */
  padding: 24px;
}
.catalog-layout {
  display: grid;
  grid-template-columns: 225px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.catalog-tree__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: transparent;
  font-size: 13px;
  color: var(--sw-text-regular);
  text-align: left;
  cursor: pointer;
}
.catalog-tree__item:hover {
  background: var(--sw-color-primary-soft);
}
.catalog-tree__item.is-active {
  background: var(--sw-color-primary);
  color: #ffffff;
  font-weight: 500;
}
.catalog-tree__count {
  font-size: 12px;
  opacity: 0.75;
}
.catalog-tree__manage {
  margin-top: 10px;
  min-height: 34px;
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  background: transparent;
  font-size: 13px;
  color: var(--sw-text-secondary);
  cursor: pointer;
}
.catalog-tree__manage:hover {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}
.catalog-page__toolbar {
  margin-bottom: 16px;
  padding: 20px 21px;
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
  flex: 0 0 420px;
  max-width: 100%;
}
.catalog-page__search :deep(.el-input__wrapper) {
  background: #f8fafe;
}
.catalog-page__search :deep(input::placeholder) {
  color: #a1aabe;
}
.catalog-page__query {
  margin-left: 120px;
  width: 96px;
  height: 34px;
}
.catalog-page__reset {
  width: 80px;
  height: 34px;
  margin-left: 1px;
  color: #17213a;
}
.catalog-page__alert {
  margin-bottom: 12px;
}
.catalog-sections {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
  gap: 16px;
}
.catalog-section {
  margin-bottom: 14px;
  padding: 14px 18px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
}
.catalog-section__empty {
  min-height: 120px;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sw-text-secondary);
  font-size: 13px;
}
.catalog-section__title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.catalog-section__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.catalog-mini {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-card);
  font-size: 13px;
  color: var(--sw-text-regular);
  cursor: pointer;
}
.catalog-mini:hover {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}
.catalog-mini__rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-size: 12px;
  font-weight: 600;
}
/* V012-BUG-009 复开：列表化（不用卡片）——分类分组带 + 多列条目，参考蓝凌流程发起 */
.catalog-list {
  min-height: 260px;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  background: #fff;
}
.catalog-group {
  margin-bottom: 14px;
}
.catalog-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-left: 3px solid var(--sw-color-primary);
  border-radius: 4px;
  background: #eef2fb;
}
.catalog-group__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.catalog-group__count {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.catalog-group__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px 24px;
  padding: 10px 6px 2px;
}
.catalog-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 40px;
  padding: 4px 8px;
  border-radius: var(--sw-radius-base);
  cursor: pointer;
  transition: background 0.15s ease;
}
.catalog-item:hover {
  background: var(--sw-color-primary-soft);
}
.catalog-item__icon {
  display: inline-flex;
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
}
.catalog-item__icon svg {
  width: 15px;
  height: 15px;
}
.catalog-item__icon--tone-info {
  background: var(--sw-info-bg);
  color: #20b8cd;
}
.catalog-item__icon--tone-success {
  background: var(--sw-info-bg);
  color: #18a67a;
}
.catalog-item__icon--tone-purple {
  background: var(--sw-color-primary-soft);
  color: #8b5cf6;
}
.catalog-item__name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  color: var(--sw-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-item:hover .catalog-item__name {
  color: var(--sw-color-primary);
}
.catalog-item__star {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  font-size: 15px;
  line-height: 1;
  color: var(--sw-border-base);
  cursor: pointer;
  transition:
    color 0.15s ease,
    transform 0.15s ease;
}
.catalog-item__star:hover {
  transform: scale(1.15);
}
.catalog-item__star.is-active {
  color: #f7ba2a;
}
@media (max-width: 1439px) {
  .catalog-group__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 1199px) {
  .catalog-group__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.catalog-mini__icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
}
.catalog-mini__icon svg {
  width: 12px;
  height: 12px;
}
.catalog-page__note {
  margin: 16px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
</style>

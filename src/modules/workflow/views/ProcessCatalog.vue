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
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  queryCatalogItems,
  queryCategoryCounts,
  queryCatalogItem,
  listPortalCategories,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
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
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const items = ref<CatalogItem[]>([])
const total = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const keyword = ref('')
// '' = 全部；0 = 未分类；其余为分类 id
const activeCategory = ref<number | ''>('')

const categories = ref<CatalogCategory[]>([])
const counts = ref<Record<string, number>>({})

// ─── 收藏 / 常用 / 最近使用（V012-BUG-009） ───
const favorites = ref<FavoriteItem[]>([])
const frequentItems = ref<FavoriteItem[]>([])
const recentItems = ref<FavoriteItem[]>([])
const toggling = ref('')

const canManageCategories = computed(
  () => userStore.superAdmin || userStore.permissions.has('workflow:catalog:manage'),
)

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
  void router.push(`/form/form-render/${item.formKey}`)
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

// ─── 分类维护（workflow:catalog:manage） ───
const manageVisible = ref(false)
const manageList = ref<CatalogCategory[]>([])
const manageLoading = ref(false)
const newCategoryName = ref('')
const editingCategoryId = ref<number | null>(null)
const editingCategoryName = ref('')

async function openManage() {
  manageVisible.value = true
  manageLoading.value = true
  try {
    manageList.value = await listCategories()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('catalog.categoryLoadFailed'))
  } finally {
    manageLoading.value = false
  }
}

async function addCategory() {
  const name = newCategoryName.value.trim()
  if (!name) return
  try {
    await createCategory({ name })
    newCategoryName.value = ''
    manageList.value = await listCategories()
    await loadCatalog()
    ElMessage.success(t('catalog.categoryCreated'))
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('catalog.categorySaveFailed'))
  }
}

async function renameCategory() {
  if (editingCategoryId.value == null || !editingCategoryName.value.trim()) return
  try {
    await updateCategory(editingCategoryId.value, { name: editingCategoryName.value.trim() })
    editingCategoryId.value = null
    manageList.value = await listCategories()
    await loadCatalog()
    ElMessage.success(t('catalog.categoryUpdated'))
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('catalog.categorySaveFailed'))
  }
}

function startRename(category: CatalogCategory) {
  editingCategoryId.value = category.id
  editingCategoryName.value = category.name
}

async function removeCategory(category: CatalogCategory) {
  try {
    await ElMessageBox.confirm(t('catalog.categoryDeleteConfirm', { name: category.name }), {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteCategory(category.id)
    manageList.value = await listCategories()
    await loadCatalog()
    ElMessage.success(t('catalog.categoryDeleted'))
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('catalog.categoryDeleteFailed'))
  }
}

onMounted(() => {
  void loadCatalog()
  void loadUsageSections()
})
</script>

<template>
  <div class="catalog-page">
    <header class="catalog-page__header">
      <h2 class="catalog-page__title">{{ t('workflow.processCenter') }}</h2>
      <p class="catalog-page__subtitle">{{ t('workflow.catalogSubtitle') }}</p>
    </header>

    <!-- V012-BUG-009：左分类树 + 右列表 -->
    <div class="catalog-layout">
      <aside class="catalog-tree" role="tree" :aria-label="t('workflow.processCenter')">
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
        <button
          v-if="canManageCategories"
          type="button"
          class="catalog-tree__manage"
          @click="openManage"
        >
          {{ t('catalog.manageCategories') }}
        </button>
      </aside>

      <div class="catalog-main">
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
        </div>

        <el-alert
          v-if="errorMsg"
          :title="errorMsg"
          type="error"
          :closable="false"
          show-icon
          class="catalog-page__alert"
        />

        <!-- 常用流程 Top5（租户内发起总量） -->
        <section v-if="frequentItems.length" class="catalog-section">
          <h3 class="catalog-section__title">{{ t('catalog.frequentlyStarted') }}</h3>
          <div class="catalog-section__chips">
            <button
              v-for="(entry, index) in frequentItems"
              :key="entry.processKey"
              type="button"
              class="catalog-mini"
              @click="openByKey(entry)"
            >
              <span class="catalog-mini__rank">{{ index + 1 }}</span>
              <span class="catalog-mini__name">{{ entry.name }}</span>
            </button>
          </div>
        </section>

        <!-- 最近使用 Top5（本人最近发起） -->
        <section v-if="recentItems.length" class="catalog-section">
          <h3 class="catalog-section__title">{{ t('catalog.recentlyUsed') }}</h3>
          <div class="catalog-section__chips">
            <button
              v-for="entry in recentItems"
              :key="entry.processKey"
              type="button"
              class="catalog-mini"
              @click="openByKey(entry)"
            >
              <span class="catalog-mini__name">{{ entry.name }}</span>
            </button>
          </div>
        </section>

        <h3 class="catalog-page__result-title">{{ resultTitle }}</h3>

        <div v-loading="loading" class="catalog-page__grid">
          <el-empty v-if="isEmpty" :description="t('workflow.noCatalogItems')" />
          <div v-for="item in orderedItems" :key="item.itemKey" class="catalog-card">
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
              <!-- V012-BUG-009：收藏星标（收藏置顶） -->
              <button
                type="button"
                class="catalog-card__star"
                :class="{ 'is-active': favoriteKeys.has(item.itemKey) }"
                :aria-label="
                  favoriteKeys.has(item.itemKey) ? t('catalog.unfavorite') : t('catalog.favorite')
                "
                :disabled="toggling === item.itemKey"
                @click="toggleFavorite(item)"
              >
                ★
              </button>
            </div>
            <p class="catalog-card__desc">{{ item.description ?? '' }}</p>
            <span class="catalog-card__meta">{{ itemMeta(item) }}</span>
            <div class="catalog-card__actions">
              <span v-if="favoriteKeys.has(item.itemKey)" class="catalog-card__fav-tag">{{
                t('catalog.favoritedTag')
              }}</span>
              <button type="button" class="catalog-card__launch" @click="openItem(item)">
                {{ t('catalog.launch') }}
              </button>
            </div>
          </div>
        </div>

        <p class="catalog-page__note">{{ t('catalog.permissionNote') }}</p>
      </div>
    </div>

    <!-- 分类维护（workflow:catalog:manage） -->
    <el-dialog v-model="manageVisible" :title="t('catalog.manageCategories')" width="560px">
      <div class="category-manage">
        <div class="category-manage__new">
          <el-input
            v-model="newCategoryName"
            :placeholder="t('catalog.newCategoryName')"
            maxlength="32"
            @keyup.enter="addCategory"
          />
          <el-button type="primary" @click="addCategory">{{ t('common.create') }}</el-button>
        </div>
        <div v-loading="manageLoading" class="category-manage__list">
          <div v-for="category in manageList" :key="category.id" class="category-manage__row">
            <template v-if="editingCategoryId === category.id">
              <el-input v-model="editingCategoryName" maxlength="32" size="small" />
              <el-button size="small" type="primary" @click="renameCategory">{{
                t('common.save')
              }}</el-button>
              <el-button size="small" @click="editingCategoryId = null">{{
                t('common.cancel')
              }}</el-button>
            </template>
            <template v-else>
              <span class="category-manage__name">{{ category.name }}</span>
              <el-button link type="primary" size="small" @click="startRename(category)">{{
                t('common.rename')
              }}</el-button>
              <el-button link type="danger" size="small" @click="removeCategory(category)">{{
                t('common.delete')
              }}</el-button>
            </template>
          </div>
          <el-empty
            v-if="!manageLoading && manageList.length === 0"
            :description="t('workflow.noCatalogItems')"
          />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
/* P53 设计节点21/22-26 基础上 V012-BUG-009 改双栏：左分类树 240 + 右内容。 */
.catalog-page {
  max-width: 1152px;
  padding: 28px 32px 32px;
  margin: 0 auto;
}
.catalog-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.catalog-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 10px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  position: sticky;
  top: 76px;
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
  width: 420px;
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
  margin-left: 1px;
  color: #17213a;
}
.catalog-page__count {
  margin-left: auto;
  font-size: 13px;
  color: var(--sw-text-secondary);
  white-space: nowrap;
}
.catalog-page__alert {
  margin-bottom: 12px;
}
.catalog-section {
  margin-bottom: 14px;
  padding: 14px 18px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
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
.catalog-page__result-title {
  margin: 16px 0;
  font-size: 15px;
  line-height: 40px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.catalog-page__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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
  gap: 8px;
  margin-top: 9px;
}
.catalog-card__icon svg {
  width: 18px;
  height: 18px;
}
.catalog-card__name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 17px;
  line-height: 25px;
  font-weight: 600;
  color: var(--sw-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-card__star {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  color: var(--sw-border-base);
  cursor: pointer;
  transition:
    color 0.15s ease,
    transform 0.15s ease;
}
.catalog-card__star:hover {
  transform: scale(1.15);
}
.catalog-card__star.is-active {
  color: #f7ba2a;
}
.catalog-card__fav-tag {
  font-size: 12px;
  color: #f7ba2a;
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
.category-manage__new {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.category-manage__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 120px;
  max-height: 320px;
  overflow-y: auto;
}
.category-manage__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
}
.category-manage__name {
  flex: 1 1 auto;
  font-size: 13px;
  color: var(--sw-text-primary);
}
</style>

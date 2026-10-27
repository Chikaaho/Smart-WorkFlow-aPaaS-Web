<script setup lang="ts">
import { useI18n } from '@/locales'
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

const { t } = useI18n()
/**
 * ProcessCatalog — 流程中心（v0.0.2 P4；V012-BUG-009 改版）。
 *
 * 左侧分类树（全部/分类/未分类，带可见计数）+ 右侧流程列表；
 * 收藏星标（最近收藏置顶）；常用流程 Top5（租户内发起总量）；最近使用 Top5
 * （本人最近发起去重）；分类维护入口按 workflow:catalog:manage 权限呈现。
 * 分类聚合数量仅来自服务端可见集，不泄漏不可见事项。
 */
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

// ─── 0.2.0 分类侧栏（direction-sidebar-navigation categories 增量）：236/64、底部 48 开关 ───
const treeCollapsed = ref(false)

interface CategoryRow {
  key: string
  id: number | ''
  name: string
  count: number
}

const treeRows = computed<CategoryRow[]>(() => {
  const rows: CategoryRow[] = [
    { key: 'all', id: '', name: t('workflow.catalogAll'), count: itemCountOf('') },
  ]
  for (const category of categories.value) {
    rows.push({
      key: `c-${category.id}`,
      id: category.id,
      name: category.name,
      count: itemCountOf(category.id),
    })
  }
  // 0.2.0 参考节点 97:2：未分类为固定过滤入口（计数 0 也保留行）。
  rows.push({
    key: 'uncategorized',
    id: 0,
    name: t('workflow.uncategorized'),
    count: itemCountOf(0),
  })
  return rows
})

/** 收起态首字兜底（与多级侧栏口径一致：当前语言展示名首字）。 */
function glyphOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0) : ''
}

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

function itemCountOf(categoryId: number | ''): number {
  if (categoryId === '') return total.value
  const key = String(categoryId)
  return counts.value[key] ?? 0
}

/** 0.2.0 参考节点 97:2：主列表为单表格，分类列由分类树映射（服务端不下发分类名）。 */
const categoryNameById = computed(() => {
  const map = new Map<number | null, string>()
  for (const category of categories.value) map.set(category.id, category.name)
  return map
})

function categoryNameOf(item: CatalogItem): string {
  if (item.categoryId === null || item.categoryId === undefined) return t('workflow.uncategorized')
  return categoryNameById.value.get(item.categoryId) ?? t('workflow.uncategorized')
}

function resetFilter(): void {
  keyword.value = ''
  activeCategory.value = ''
  pageNum.value = 1
  void loadCatalog()
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
    <!-- 0.2.0 参考节点 97:2：分类侧栏贴左全高（236/64），主体从 256 起；底部 48px 开关贴屏底 -->
    <div class="catalog-layout" :class="{ 'catalog-layout--collapsed': treeCollapsed }">
      <CategorySidebar
        class="catalog-tree"
        :class="{ 'catalog-tree--collapsed': treeCollapsed }"
        sticky
        role="tree"
        :aria-label="t('workflow.processCenter')"
      >
        <p class="catalog-tree__title">{{ t('workflow.processCategories') }}</p>
        <div class="catalog-tree__rows">
          <el-tooltip
            v-for="row in treeRows"
            :key="row.key"
            :content="`${row.name} ${row.count}`"
            :disabled="!treeCollapsed"
            placement="right"
            :show-after="150"
          >
            <button
              type="button"
              class="catalog-tree__item"
              :class="{ 'is-active': activeCategory === row.id }"
              :aria-current="activeCategory === row.id ? 'true' : undefined"
              @click="selectCategory(row.id)"
            >
              <span class="catalog-tree__glyph" aria-hidden="true">{{ glyphOf(row.name) }}</span>
              <template v-if="!treeCollapsed">
                <span class="catalog-tree__name">{{ row.name }}</span>
                <span class="catalog-tree__count">{{ row.count }}</span>
              </template>
            </button>
          </el-tooltip>
        </div>
        <button
          type="button"
          class="catalog-tree__toggle"
          :aria-expanded="treeCollapsed ? 'false' : 'true'"
          @click="treeCollapsed = !treeCollapsed"
        >
          <svg
            v-if="!treeCollapsed"
            class="catalog-tree__toggle-icon"
            viewBox="0 0 18 18"
            width="18"
            height="18"
            aria-hidden="true"
          >
            <path d="M2.5 4.5v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <path
              d="M15 9H6.5M9.8 5.7 6.5 9l3.3 3.3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span v-if="!treeCollapsed">{{ t('workflow.treeCollapse') }}</span>
          <span v-else aria-hidden="true">→</span>
        </button>
      </CategorySidebar>

      <div class="catalog-main">
        <div class="catalog-page__toolbar">
          <div class="catalog-page__toolbar-row">
            <label class="catalog-page__label" for="catalog-keyword">{{
              t('catalog.processNameLabel')
            }}</label>
            <el-input
              id="catalog-keyword"
              v-model="keyword"
              class="catalog-page__search"
              :placeholder="t('workflow.searchCatalogPlaceholder')"
              clearable
              @keyup.enter="searchCatalog"
              @clear="searchCatalog"
            />
            <span class="catalog-page__spacer" aria-hidden="true"></span>
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
          <!-- 常用流程 Top5（租户内发起总量）；参考 97:2 为竖排灰底行 + 右侧「发起 >」 -->
          <section class="catalog-section">
            <h3 class="catalog-section__title">{{ t('catalog.frequentlyStarted') }}</h3>
            <ul v-if="frequentItems.length" class="catalog-rows">
              <li v-for="entry in frequentItems" :key="entry.processKey" class="catalog-rows__item">
                <button type="button" class="catalog-rows__main" @click="openByKey(entry)">
                  <span class="catalog-mini__icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3.5 1.5h5L12 5v9.5H3.5z"
                        fill="#ffffff"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linejoin="round"
                      />
                      <path
                        d="M8.5 1.5V5H12"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linejoin="round"
                      />
                      <rect
                        x="5.4"
                        y="6.7"
                        width="4.6"
                        height="1.1"
                        rx=".4"
                        fill="currentColor"
                        opacity=".45"
                      />
                      <rect
                        x="5.4"
                        y="9"
                        width="4.6"
                        height="1.1"
                        rx=".4"
                        fill="currentColor"
                        opacity=".45"
                      />
                      <rect
                        x="5.4"
                        y="11.3"
                        width="4.6"
                        height="1.1"
                        rx=".4"
                        fill="currentColor"
                        opacity=".45"
                      />
                    </svg>
                  </span>
                  <span class="catalog-rows__name">{{ entry.name }}</span>
                </button>
                <button type="button" class="catalog-rows__launch" @click="openByKey(entry)">
                  {{ t('catalog.launchShort') }}
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            </ul>
            <p v-else class="catalog-section__empty">{{ t('workflow.noCatalogItems') }}</p>
          </section>

          <!-- 最近使用 Top5（本人最近发起） -->
          <section class="catalog-section">
            <h3 class="catalog-section__title">{{ t('catalog.recentlyUsed') }}</h3>
            <ul v-if="recentItems.length" class="catalog-rows">
              <li v-for="entry in recentItems" :key="entry.processKey" class="catalog-rows__item">
                <button type="button" class="catalog-rows__main" @click="openByKey(entry)">
                  <span class="catalog-mini__icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3.5 1.5h5L12 5v9.5H3.5z"
                        fill="#ffffff"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linejoin="round"
                      />
                      <path
                        d="M8.5 1.5V5H12"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linejoin="round"
                      />
                      <rect
                        x="5.4"
                        y="6.7"
                        width="4.6"
                        height="1.1"
                        rx=".4"
                        fill="currentColor"
                        opacity=".45"
                      />
                      <rect
                        x="5.4"
                        y="9"
                        width="4.6"
                        height="1.1"
                        rx=".4"
                        fill="currentColor"
                        opacity=".45"
                      />
                      <rect
                        x="5.4"
                        y="11.3"
                        width="4.6"
                        height="1.1"
                        rx=".4"
                        fill="currentColor"
                        opacity=".45"
                      />
                    </svg>
                  </span>
                  <span class="catalog-rows__name">{{ entry.name }}</span>
                </button>
                <button type="button" class="catalog-rows__launch" @click="openByKey(entry)">
                  {{ t('catalog.launchShort') }}
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            </ul>
            <p v-else class="catalog-section__empty">{{ t('workflow.noCatalogItems') }}</p>
          </section>
        </div>

        <!-- 0.2.0 参考节点 97:2：主列表单表格（列头 流程名称/分类/操作；行 星标+名称 | 分类 | 发起） -->
        <div v-loading="loading" class="catalog-tablecard">
          <el-empty v-if="isEmpty" :description="t('workflow.noCatalogItems')" />
          <table v-else class="catalog-table">
            <thead>
              <tr>
                <th class="catalog-table__name">{{ t('catalog.processNameLabel') }}</th>
                <th class="catalog-table__category">{{ t('catalog.categoryCol') }}</th>
                <th class="catalog-table__action">{{ t('catalog.actionCol') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in orderedItems" :key="item.itemKey">
                <td class="catalog-table__name">
                  <div class="catalog-table__namecell">
                    <button
                      type="button"
                      class="catalog-item__star"
                      :class="{ 'is-active': favoriteKeys.has(item.itemKey) }"
                      :aria-label="
                        favoriteKeys.has(item.itemKey)
                          ? t('catalog.unfavorite')
                          : t('catalog.favorite')
                      "
                      :disabled="toggling === item.itemKey"
                      @click="toggleFavorite(item)"
                    >
                      {{ favoriteKeys.has(item.itemKey) ? '★' : '☆' }}
                    </button>
                    <button type="button" class="catalog-table__link" @click="openItem(item)">
                      {{ item.name }}
                    </button>
                  </div>
                </td>
                <td class="catalog-table__category">{{ categoryNameOf(item) }}</td>
                <td class="catalog-table__action">
                  <button type="button" class="catalog-table__launch" @click="openItem(item)">
                    {{ t('catalog.launchShort') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!isEmpty" class="catalog-table__footer">
            <ListPagination
              :total="total"
              :page-num="pageNum"
              :page-size="pageSize"
              :page-sizes="[20, 40, 60, 100]"
              appearance="design"
              align="space-between"
              layout="prev, pager, next, sizes, jumper"
              total-text
              :inset="false"
              @update:page-num="handlePageNumChange"
              @update:page-size="handlePageSizeChange"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 0.2.0 参考节点 97:2：页面不设外边距；侧栏为贴左全高白色栏，主体从 256 起。 */
.catalog-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  box-sizing: border-box;
}
.catalog-layout {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  align-items: stretch;
  min-height: 0;
}
.catalog-layout--collapsed {
  grid-template-columns: 64px minmax(0, 1fr);
}
.catalog-tree {
  padding: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: var(--sw-surface-card);
  overflow: visible;
  gap: 0;
  top: 0;
}
.catalog-tree__title {
  margin: 0;
  padding: 18px 16px 10px;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: var(--sw-text-secondary);
}
.catalog-tree--collapsed .catalog-tree__title {
  padding: 18px 0 10px;
  text-align: center;
}
.catalog-tree__rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 12px 8px;
  overflow-y: auto;
}
.catalog-tree--collapsed .catalog-tree__rows {
  padding: 0 4px 8px;
}
.catalog-tree__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 15px;
  min-height: 40px;
  padding: 0 12px 0 17px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  color: #303133;
  text-align: left;
  cursor: pointer;
}
.catalog-tree--collapsed .catalog-tree__item {
  justify-content: center;
  gap: 0;
  padding: 0;
}
.catalog-tree__item:hover {
  background: #f4f6fb;
}
.catalog-tree__item.is-active {
  background: var(--sw-color-primary-soft, #eff6ff);
  color: var(--sw-color-primary);
  font-weight: 500;
}
.catalog-tree__item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 2px;
  background: var(--sw-color-primary);
}
.catalog-tree__glyph {
  flex: none;
  width: 14px;
  font-size: 13px;
  line-height: 1;
  text-align: center;
  color: #303133;
}
.catalog-tree__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-tree__count {
  flex: none;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.catalog-tree__item.is-active .catalog-tree__glyph,
.catalog-tree__item.is-active .catalog-tree__count {
  color: var(--sw-color-primary);
}
.catalog-tree__toggle {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-height: 48px;
  margin-top: auto;
  padding: 0 16px;
  border: none;
  border-top: 1px solid var(--sw-border-light);
  background: transparent;
  font-size: 14px;
  color: var(--sw-text-secondary);
  cursor: pointer;
}
.catalog-tree--collapsed .catalog-tree__toggle {
  justify-content: center;
  padding: 0;
}
.catalog-tree__toggle:hover {
  color: var(--sw-color-primary);
}
.catalog-main {
  min-width: 0;
  padding: 20px;
}
.catalog-page__toolbar {
  margin-bottom: 16px;
  padding: 15px 17px 15px 19px;
  background: var(--sw-surface-card);
  border: 1px solid #dde3ef;
  border-radius: 8px;
  box-shadow: none;
}
.catalog-page__toolbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
/* 0.2.0 参考节点 97:2：标签+输入框居左、查询/重置靠右；输入 395×32，按钮 72/70×32。 */
.catalog-page__label {
  flex: none;
  font-size: 13px;
  color: #5c6370;
}
.catalog-page__spacer {
  flex: 1;
}
.catalog-page__search {
  flex: 0 0 395px;
  max-width: 100%;
}
.catalog-page__search :deep(.el-input__wrapper) {
  background: #ffffff;
  box-shadow: 0 0 0 1px #dde3ef inset;
}
.catalog-page__search :deep(input::placeholder) {
  color: #a1aabe;
}
.catalog-page__query {
  margin-left: 0;
  width: 72px;
  height: 32px;
  padding: 0;
}
.catalog-page__reset {
  width: 70px;
  height: 32px;
  margin-left: 0;
  padding: 0;
  color: #17213a;
}
.catalog-page__alert {
  margin-bottom: 12px;
}
.catalog-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.catalog-section {
  padding: 17px 18px 16px;
  background: var(--sw-surface-card);
  border: 1px solid #dde3ef;
  border-radius: 8px;
  box-shadow: none;
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
  margin: 0 0 11px;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
  color: var(--sw-text-primary);
}
/* 参考 97:2：竖排灰底行 38 高、8 间距；14px 文档图标 + 名称 + 右侧「发起 ›」。 */
.catalog-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.catalog-rows__item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  box-sizing: border-box;
  padding: 0 14px 0 12px;
  background: #f4f6fb;
  border: 1px solid #e3e8f2;
  border-radius: 6px;
}
.catalog-rows__main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--sw-text-primary);
  cursor: pointer;
  text-align: left;
}
.catalog-mini__icon {
  display: inline-flex;
  flex: none;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  color: var(--sw-color-primary);
}
.catalog-mini__icon svg {
  width: 16px;
  height: 16px;
}
.catalog-rows__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-rows__launch {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--sw-color-primary);
  cursor: pointer;
}
/* 参考 97:2：主表格 40px 表头 + 60px 行 + 50px 卡内分页；列头 64/1646/1811。 */
.catalog-tablecard {
  margin-top: 16px;
  background: var(--sw-surface-card);
  border: 1px solid #dde3ef;
  border-radius: 8px;
  overflow: hidden;
}
.catalog-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  background: var(--sw-surface-card);
}
.catalog-table th {
  height: 40px;
  padding: 0;
  background: #f4f6fb;
  font-size: 13px;
  font-weight: 500;
  color: var(--sw-text-secondary);
  text-align: left;
}
.catalog-table th.catalog-table__name {
  padding-left: 64px;
}
.catalog-table th.catalog-table__category {
  width: 165px;
}
.catalog-table th.catalog-table__action {
  width: 72px;
  padding-right: 16px;
}
.catalog-table td {
  height: 60px;
  padding: 0;
  border-top: 1px solid #e9edf5;
  font-size: 14px;
  color: var(--sw-text-regular);
  vertical-align: middle;
}
.catalog-table tbody tr:first-child td {
  border-top: none;
}
.catalog-table td.catalog-table__name {
  padding: 0;
}
.catalog-table td.catalog-table__category {
  width: 165px;
}
.catalog-table td.catalog-table__action {
  width: 72px;
  padding-right: 16px;
  text-align: left;
}
.catalog-table tbody tr:hover {
  background: #fafcff;
}
.catalog-table__namecell {
  display: flex;
  align-items: center;
  gap: 24px;
  height: 60px;
  padding-left: 24px;
  box-sizing: border-box;
}
.catalog-item__star {
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 16px;
  line-height: 16px;
  color: #a8b0c2;
  cursor: pointer;
}
.catalog-item__star.is-active {
  color: #f7ba2a;
}
.catalog-table__link {
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--sw-text-primary);
  cursor: pointer;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-table__link:hover {
  color: var(--sw-color-primary);
}
.catalog-table__launch {
  width: 72px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: var(--sw-color-primary);
  font-size: 13px;
  color: #ffffff;
  cursor: pointer;
}
.catalog-table__launch:hover {
  background: color-mix(in srgb, var(--sw-color-primary) 88%, black);
}
.catalog-table__footer {
  padding: 0 24px 0 16px;
  border-top: 1px solid #e9edf5;
}
.catalog-table__footer :deep(.list-pagination) {
  width: 100%;
  min-height: 50px;
}
/* 参考 97:2 分页：上/下一页 80 无描边、页码 32、每页条数 112、跳页块 116。 */
.catalog-table__footer :deep(.btn-prev),
.catalog-table__footer :deep(.btn-next) {
  width: 80px;
  border: none;
}
.catalog-table__footer :deep(.el-pagination__sizes .el-select) {
  width: 112px;
}
.catalog-table__footer :deep(.el-pagination__jump) {
  width: 116px;
}
@media (max-width: 1023px) {
  .catalog-layout,
  .catalog-layout--collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .catalog-tree {
    border: 1px solid var(--sw-border-light);
    border-radius: var(--sw-radius-card);
    margin: 16px 16px 0;
  }
  .catalog-tree__toggle {
    justify-content: center;
    padding: 0;
  }
  .catalog-main {
    padding: 16px;
  }
  .catalog-sections {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

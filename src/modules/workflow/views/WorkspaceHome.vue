<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * WorkspaceHome — 工作台（v0.0.2 P54，三类身份默认首页）。
 *
 * 首批四组件：待办、我发起的、抄送、常用事项；支持显示/隐藏、顺序调整、
 * 常用事项选择，按当前租户及用户持久化，可恢复默认。
 * 隐藏组件不查询数据；失效事项（不可见/未发布/无绑定）不成为可执行入口；
 * 组件数据查询失败（含撤权）以空态收敛，不阻塞整页。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Setting, Star, Clock, Promotion, CircleCheck, EditPen } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import {
  getWorkspaceLayout,
  saveWorkspaceLayout,
  resetWorkspaceLayout,
  queryCatalogItems,
  queryMyCopies,
  type CatalogItem,
} from '@/modules/workflow/api/oa'
import { queryTodoTasks, myInstances, myDrafts, myProcessed } from '@/modules/workflow/api'
import type { WorkspaceComponent, WorkspaceComponentKey } from '@/contracts/catalog'
import { ApiError } from '@/foundation/request'

const router = useRouter()
const userStore = useUserStore()

// ─── 布局状态 ───
const components = ref<WorkspaceComponent[]>([])
const favoriteKeys = ref<string[]>([])
const custom = ref(false)
const loading = ref(false)
const configVisible = ref(false)
const dirty = ref(false)

// ─── 组件数据 ───
const todoList = ref<Array<Record<string, unknown>>>([])
const processedList = ref<Array<Record<string, unknown>>>([])
const initiatedList = ref<Array<Record<string, unknown>>>([])
const ccList = ref<Array<Record<string, unknown>>>([])
const draftsList = ref<Array<Record<string, unknown>>>([])
const favoriteItems = ref<CatalogItem[]>([])

// ─── 问候与真实统计（P53 设计 01：统计只使用真实分页 total，不伪造本周/超时维度） ───
const todoTotal = ref(0)
const initiatedTotal = ref(0)
const processedTotal = ref(0)
const draftsTotal = ref(0)

const displayName = computed(() => userStore.user?.displayName ?? '')
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return t('workspace.greetingMorning')
  if (hour < 18) return t('workspace.greetingAfternoon')
  return t('workspace.greetingEvening')
})

/** 统计条：全部来自当前用户真实分页 total（无时间维度/超时维度接口，不做伪统计）。 */
/** 统计卡图标与底色（纯视觉装饰，取 P53 设计 01；数据仍全部为真实 total） */
const STAT_ICONS: Record<string, { icon: unknown; bg: string; color: string }> = {
  todo: { icon: Clock, bg: 'var(--sw-color-primary-soft)', color: 'var(--sw-color-primary)' },
  initiated: { icon: Promotion, bg: 'var(--sw-info-bg)', color: 'var(--sw-info)' },
  processed: { icon: CircleCheck, bg: 'var(--sw-success-bg)', color: 'var(--sw-success)' },
  drafts: { icon: EditPen, bg: 'var(--sw-warning-bg)', color: 'var(--sw-warning)' },
}

const stats = computed(() => [
  { key: 'todo', label: t('workspace.statMyTodo'), value: todoTotal.value },
  { key: 'initiated', label: t('workspace.statInitiated'), value: initiatedTotal.value },
  { key: 'processed', label: t('workspace.statProcessed'), value: processedTotal.value },
  { key: 'drafts', label: t('workspace.statDrafts'), value: draftsTotal.value },
])

/**
 * 工作台卡片标题的**文案键**（不是求值结果）。
 * 模块加载期调用 t() 会把语言固化，切换语言后卡片标题不跟着变——真实浏览器已抓到该现象。
 * 取值一律经 componentTitle()，在渲染期解析。
 */
const COMPONENT_TITLE_KEYS: Record<WorkspaceComponentKey, string> = {
  todo: 'workflow.myTodoTitle',
  myProcessed: 'workflow.myProcessed',
  myInitiated: 'common.startedByMe',
  cc: 'workflow.cc',
  favoriteItems: 'workflow.favoriteItems',
  drafts: 'common.statusDraft',
  messages: 'common.message',
}

/** 卡片标题显示名：渲染期按当前语言解析。 */
function componentTitle(key: WorkspaceComponentKey): string {
  return t(COMPONENT_TITLE_KEYS[key])
}

const orderedVisible = computed(() =>
  components.value
    .filter((c) => c.visible)
    .slice()
    .sort((a, b) => a.order - b.order),
)

async function loadLayout() {
  loading.value = true
  try {
    const resp = await getWorkspaceLayout()
    custom.value = resp.custom
    components.value = withNewComponents(resp.layout.components)
    favoriteKeys.value = resp.layout.favoriteItemKeys
    await Promise.all([loadComponentData(), loadFavorites()])
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.workspaceLoadFailed'))
  } finally {
    loading.value = false
  }
}

/** I4 §3.7：旧布局缺 drafts/messages/myProcessed 键时回落补默认，避免版本升级后组件丢失。 */
function withNewComponents(list: WorkspaceComponent[]): WorkspaceComponent[] {
  const keys = new Set(list.map((c) => c.key))
  const merged = [...list]
  const defaults: WorkspaceComponent[] = [
    { key: 'drafts', visible: true, order: 5, span: 1 },
    { key: 'messages', visible: true, order: 6, span: 1 },
    { key: 'myProcessed', visible: true, order: 7, span: 1 },
  ]
  for (const d of defaults) {
    if (!keys.has(d.key)) merged.push(d)
  }
  return merged
}

function openDraft(item: Record<string, unknown>) {
  const formKey = String(item.formKey ?? '')
  const draftId = String(item.id ?? '')
  void router.push(`/form/form-render/${formKey}?draftId=${draftId}&mode=draft`)
}

async function loadComponentData() {
  const tasks: Array<Promise<void>> = []
  const visible = (key: WorkspaceComponentKey) =>
    components.value.some((c) => c.key === key && c.visible)
  if (visible('todo')) {
    tasks.push(
      queryTodoTasks({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          todoList.value = page.list as unknown as Array<Record<string, unknown>>
          todoTotal.value = page.total
        })
        .catch(() => {
          todoList.value = []
          todoTotal.value = 0
        }),
    )
  }
  if (visible('myProcessed')) {
    tasks.push(
      myProcessed({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          processedList.value = page.list as unknown as Array<Record<string, unknown>>
          processedTotal.value = page.total
        })
        .catch(() => {
          processedList.value = []
          processedTotal.value = 0
        }),
    )
  }
  if (visible('myInitiated')) {
    tasks.push(
      myInstances({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          initiatedList.value = page.list as unknown as Array<Record<string, unknown>>
          initiatedTotal.value = page.total
        })
        .catch(() => {
          initiatedList.value = []
          initiatedTotal.value = 0
        }),
    )
  }
  if (visible('drafts')) {
    tasks.push(
      myDrafts({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          draftsList.value = page.list as unknown as Array<Record<string, unknown>>
          draftsTotal.value = page.total
        })
        .catch(() => {
          draftsList.value = []
          draftsTotal.value = 0
        }),
    )
  }
  if (visible('cc')) {
    tasks.push(
      queryMyCopies({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          ccList.value = page.list as unknown as Array<Record<string, unknown>>
        })
        .catch(() => {
          ccList.value = []
        }),
    )
  }
  await Promise.all(tasks)
}

/** 常用事项仅以当前可见目录解析：失效事项不渲染为入口。 */
async function loadFavorites() {
  if (!components.value.some((c) => c.key === 'favoriteItems' && c.visible)) {
    favoriteItems.value = []
    return
  }
  try {
    const page = await queryCatalogItems({ pageNum: 1, pageSize: 100 })
    const keys = new Set(favoriteKeys.value)
    favoriteItems.value = page.list.filter((item) => keys.has(item.itemKey))
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    favoriteItems.value = []
  }
}

function openForm(formKey: string) {
  void router.push(`/form/form-render/${formKey}`)
}

// ─── 配置模式 ───
const catalogChoices = ref<CatalogItem[]>([])

async function openConfig() {
  configVisible.value = true
  try {
    const page = await queryCatalogItems({ pageNum: 1, pageSize: 100 })
    catalogChoices.value = page.list
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    catalogChoices.value = []
  }
}
function toggleVisible(component: WorkspaceComponent) {
  component.visible = !component.visible
  dirty.value = true
}

function move(component: WorkspaceComponent, delta: -1 | 1) {
  const sorted = components.value.slice().sort((a, b) => a.order - b.order)
  const index = sorted.indexOf(component)
  const target = index + delta
  if (target < 0 || target >= sorted.length) return
  const other = sorted[target]
  const tmp = component.order
  component.order = other.order
  other.order = tmp
  dirty.value = true
}

/** 布局宽度调整：半宽（1）↔ 整行（2），随布局持久化。 */
function toggleSpan(component: WorkspaceComponent) {
  component.span = component.span === 2 ? 1 : 2
  dirty.value = true
}

function toggleFavorite(key: string) {
  const index = favoriteKeys.value.indexOf(key)
  if (index >= 0) {
    favoriteKeys.value.splice(index, 1)
  } else if (favoriteKeys.value.length < 20) {
    favoriteKeys.value.push(key)
  } else {
    ElMessage.warning(t('workflow.favoritesLimit'))
    return
  }
  dirty.value = true
}

async function saveConfig() {
  try {
    await saveWorkspaceLayout({
      components: components.value.map((c) => ({ ...c })),
      favoriteItemKeys: [...favoriteKeys.value],
    })
    custom.value = true
    dirty.value = false
    configVisible.value = false
    ElMessage.success(t('workflow.workspaceSaved'))
    await loadLayout()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.workspaceSaveFailed'))
  }
}

async function resetConfig() {
  try {
    await resetWorkspaceLayout()
    ElMessage.success(t('workflow.layoutRestored'))
    dirty.value = false
    configVisible.value = false
    await loadLayout()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.layoutRestoreFailed'))
  }
}

onMounted(loadLayout)
</script>

<template>
  <div v-loading="loading" class="workspace">
    <header class="workspace__hero">
      <div>
        <h2 class="workspace__greeting">
          {{ greeting }}{{ displayName ? '，' : '' }}{{ displayName }}
        </h2>
        <p class="workspace__hero-sub">{{ t('workspace.todoSummary', { count: todoTotal }) }}</p>
      </div>
      <el-button :icon="Setting" @click="openConfig">{{ t('common.configure') }}</el-button>
    </header>

    <div class="workspace__stats">
      <div v-for="stat in stats" :key="stat.key" class="workspace-stat">
        <div class="workspace-stat__body">
          <span class="workspace-stat__label">{{ stat.label }}</span>
          <span class="workspace-stat__value">{{ stat.value }}</span>
        </div>
        <span
          class="workspace-stat__icon"
          :style="{ background: STAT_ICONS[stat.key]?.bg, color: STAT_ICONS[stat.key]?.color }"
        >
          <el-icon :size="22"><component :is="STAT_ICONS[stat.key]?.icon" /></el-icon>
        </span>
      </div>
    </div>

    <div class="workspace__grid">
      <section
        v-for="component in orderedVisible"
        :key="component.key"
        class="workspace-card"
        :class="{ 'workspace-card--wide': component.span === 2 }"
      >
        <h3 class="workspace-card__title">{{ componentTitle(component.key) }}</h3>

        <template v-if="component.key === 'todo'">
          <p v-if="todoList.length === 0" class="workspace-card__empty">
            {{ t('workflow.noTodoTasks') }}
          </p>
          <ul v-else class="workspace-card__list">
            <li v-for="(item, index) in todoList" :key="index" class="workspace-card__row">
              <span>{{ (item.name as string) ?? (item.taskId as string) ?? '-' }}</span>
              <el-button
                size="small"
                link
                type="primary"
                @click="router.push(`/workflow/task/${item.taskId as string}`)"
              >
                {{ t('workflow.handle') }}
              </el-button>
            </li>
          </ul>
        </template>

        <template v-else-if="component.key === 'myProcessed'">
          <p v-if="processedList.length === 0" class="workspace-card__empty">
            {{ t('workflow.noProcessedTasks') }}
          </p>
          <ul v-else class="workspace-card__list">
            <li v-for="(item, index) in processedList" :key="index" class="workspace-card__row">
              <span>{{ (item.taskName as string) ?? '-' }}</span>
              <el-tag v-if="item.action" size="small" type="info">{{ item.action }}</el-tag>
            </li>
          </ul>
          <el-button size="small" link type="primary" @click="router.push('/workflow/processed')">{{
            t('common.viewAll')
          }}</el-button>
        </template>

        <template v-else-if="component.key === 'myInitiated'">
          <p v-if="initiatedList.length === 0" class="workspace-card__empty">
            {{ t('workflow.noStartedProcesses') }}
          </p>
          <ul v-else class="workspace-card__list">
            <li v-for="(item, index) in initiatedList" :key="index" class="workspace-card__row">
              <span>{{ (item.processDefKey as string) ?? '-' }}</span>
              <el-tag size="small" type="info">{{ (item.status as string) ?? '-' }}</el-tag>
            </li>
          </ul>
        </template>

        <template v-else-if="component.key === 'cc'">
          <p v-if="ccList.length === 0" class="workspace-card__empty">
            {{ t('workflow.noCcItems') }}
          </p>
          <ul v-else class="workspace-card__list">
            <li v-for="(item, index) in ccList" :key="index" class="workspace-card__row">
              <span>{{ (item.formKey as string) ?? '-' }}</span>
              <span class="workspace-card__time">{{ (item.createTime as string) ?? '' }}</span>
            </li>
          </ul>
        </template>

        <template v-else-if="component.key === 'drafts'">
          <p v-if="draftsList.length === 0" class="workspace-card__empty">
            {{ t('workflow.noDrafts') }}
          </p>
          <ul v-else class="workspace-card__list">
            <li v-for="(item, index) in draftsList" :key="index" class="workspace-card__row">
              <span>{{ (item.formKey as string) ?? '-' }}</span>
              <el-button size="small" link type="primary" @click="openDraft(item)">{{
                t('workflow.continueEditing')
              }}</el-button>
            </li>
          </ul>
        </template>

        <template v-else-if="component.key === 'messages'">
          <p class="workspace-card__empty">{{ t('workflow.messagesEntryHint') }}</p>
          <el-button size="small" type="primary" @click="router.push('/notify/record')">{{
            t('workflow.openMessages')
          }}</el-button>
        </template>
        <template v-else>
          <p v-if="favoriteItems.length === 0" class="workspace-card__empty">
            {{ t('workspace.noFavorites') }}
          </p>
          <div v-else class="workspace-card__favorites">
            <button
              v-for="item in favoriteItems"
              :key="item.itemKey"
              class="favorite-item"
              type="button"
              @click="openForm(item.formKey)"
            >
              <el-icon :size="14"><Star /></el-icon>
              <span>{{ item.name }}</span>
            </button>
          </div>
        </template>
      </section>
    </div>

    <!-- 配置抽屉 -->
    <el-drawer v-model="configVisible" :title="t('workflow.workspaceConfig')" size="420px">
      <h4 class="config-section">{{ t('workflow.widgetVisibilityOrder') }}</h4>
      <ul class="config-list">
        <li
          v-for="component in components.slice().sort((a, b) => a.order - b.order)"
          :key="component.key"
          class="config-list__row"
        >
          <el-switch v-model="component.visible" @change="toggleVisible(component)" />
          <span class="config-list__name">{{ componentTitle(component.key) }}</span>
          <el-button size="small" @click="toggleSpan(component)">
            {{ component.span === 2 ? t('workflow.halfWidth') : t('workflow.fullWidth') }}
          </el-button>
          <el-button size="small" :disabled="component.order <= 1" @click="move(component, -1)">{{
            t('common.moveUp')
          }}</el-button>
          <el-button
            size="small"
            :disabled="component.order >= components.length"
            @click="move(component, 1)"
            >{{ t('common.moveDown') }}</el-button
          >
        </li>
      </ul>

      <h4 class="config-section">{{ t('workflow.favoritesPickerHint') }}</h4>
      <ul class="config-favorites">
        <li v-for="item in catalogChoices" :key="item.itemKey" class="config-list__row">
          <el-checkbox
            :model-value="favoriteKeys.includes(item.itemKey)"
            @change="toggleFavorite(item.itemKey)"
          >
            {{ item.name }}
          </el-checkbox>
        </li>
      </ul>

      <template #footer>
        <el-button @click="resetConfig">{{ t('common.restoreDefault') }}</el-button>
        <el-button type="primary" :disabled="!dirty" @click="saveConfig">{{
          t('workflow.saveWorkspaceConfig')
        }}</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.workspace {
  max-width: 1152px;
  padding: 24px 32px 32px;
  margin: 0 auto;
}
.workspace__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.workspace__greeting {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 700;
  color: var(--sw-text-primary);
}
.workspace__hero-sub {
  margin: 0;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.workspace__stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.workspace-stat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px 20px;
  text-align: left;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
}
.workspace-stat__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.workspace-stat__icon {
  position: absolute;
  top: 18px;
  right: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--sw-radius-base);
}
.workspace-stat__label {
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.workspace-stat__value {
  font-size: 26px;
  font-weight: 700;
  color: var(--sw-text-primary);
}
.workspace__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.workspace-card {
  padding: 16px 20px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
}
.workspace-card--wide {
  grid-column: 1 / -1;
}
.workspace-card__title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.workspace-card__empty {
  margin: 0;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.workspace-card__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.workspace-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--sw-border-lighter);
}
.workspace-card__row:last-child {
  border-bottom: none;
}
.workspace-card__time {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.workspace-card__favorites {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.favorite-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
  border: none;
  border-radius: var(--sw-radius-base);
  cursor: pointer;
}
.config-section {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-color-primary);
}
.config-list,
.config-favorites {
  margin: 0;
  padding: 0;
  list-style: none;
}
.config-list__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.config-list__name {
  flex: 1;
}
</style>

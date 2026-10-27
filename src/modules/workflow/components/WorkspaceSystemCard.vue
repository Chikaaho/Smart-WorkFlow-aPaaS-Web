<script setup lang="ts">
/**
 * WorkspaceSystemCard — 工作台四类系统卡片的真实数据渲染。
 *
 * 只消费既有待办/已办/抄送、目录、我发起、效能摘要接口；
 * 任一接口失败时该块以空态收敛，不影响其他卡片。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/locales'
import { queryTodoTasks, myProcessed, myInstances, myDrafts } from '../api'
import { queryMyCopies, queryCatalogItems } from '../api/oa'
import { queryAnalyticsSummary, type AnalyticsSummary } from '../api/i4'

const props = defineProps<{
  typeCode: string
  favoriteKeys?: string[]
}>()

const { t } = useI18n()
const router = useRouter()

type TodoTab = 'todo' | 'processed' | 'cc'
const activeTab = ref<TodoTab>('todo')
const todoRows = ref<Array<Record<string, unknown>>>([])
const processedRows = ref<Array<Record<string, unknown>>>([])
const ccRows = ref<Array<Record<string, unknown>>>([])
const todoTotal = ref(0)
const processedTotal = ref(0)
const ccTotal = ref(0)
const catalog = ref<Array<{ itemKey: string; name: string; formKey: string }>>([])
const initiatedRows = ref<Array<Record<string, unknown>>>([])
const analytics = ref<AnalyticsSummary | null>(null)
const loading = ref(true)
/** 旧版「统计概览」卡沿用真实四类计数，避免旧布局在新配置页显示空卡。 */
const legacyTotals = ref({ todo: 0, initiated: 0, processed: 0, drafts: 0 })

function rowTitle(row: Record<string, unknown>): string {
  for (const key of [
    'theme',
    'processName',
    'taskName',
    'title',
    'name',
    'processDefinitionName',
  ]) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return '-'
}

function rowMeta(row: Record<string, unknown>): string {
  return [
    typeof row.processName === 'string' ? row.processName : '',
    typeof row.initiatorName === 'string' ? row.initiatorName : '',
    typeof row.dueText === 'string' ? row.dueText : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function openTask(row: Record<string, unknown>): void {
  const taskId = String(row.taskId ?? '')
  if (!taskId) return
  void router.push({
    path: `/workflow/task/${taskId}`,
    query: activeTab.value === 'processed' ? { source: 'processed' } : undefined,
  })
}

function openForm(formKey: string): void {
  if (formKey) void router.push(`/form/form-render/${formKey}`)
}

const visibleRows = computed(() => {
  if (activeTab.value === 'processed') return processedRows.value
  if (activeTab.value === 'cc') return ccRows.value
  return todoRows.value
})

const quickItems = computed(() => {
  const keys = new Set(props.favoriteKeys ?? [])
  // 候选目录与已选常用事项必须区分：未选择时保持空态，不能用目录兜底冒充配置。
  return catalog.value.filter((item) => keys.has(item.itemKey)).slice(0, 6)
})

const efficiency = computed(() => {
  const summary = analytics.value
  if (!summary) return null
  const avgHours = summary.avgDurationMs == null ? null : summary.avgDurationMs / 3600000
  const completion = summary.launched
    ? Math.round((summary.completed / summary.launched) * 100)
    : null
  return {
    avg: avgHours == null ? '—' : `${avgHours.toFixed(1)} ${t('workspace.hoursUnit')}`,
    completion: completion == null ? '—' : `${completion}%`,
    launched: summary.launched,
    completed: summary.completed,
    running: summary.running,
  }
})

async function loadTodo(): Promise<void> {
  const [todo, processed, cc] = await Promise.allSettled([
    queryTodoTasks({ pageNum: 1, pageSize: 5 }),
    myProcessed({ pageNum: 1, pageSize: 5 }),
    queryMyCopies({ pageNum: 1, pageSize: 5 }),
  ])
  if (todo.status === 'fulfilled') {
    todoRows.value = todo.value.list as unknown as Array<Record<string, unknown>>
    todoTotal.value = todo.value.total
  }
  if (processed.status === 'fulfilled') {
    processedRows.value = processed.value.list as unknown as Array<Record<string, unknown>>
    processedTotal.value = processed.value.total
  }
  if (cc.status === 'fulfilled') {
    ccRows.value = cc.value.list as unknown as Array<Record<string, unknown>>
    ccTotal.value = cc.value.total
  }
}

async function loadQuick(): Promise<void> {
  try {
    const page = await queryCatalogItems({ pageNum: 1, pageSize: 100 })
    catalog.value = page.list.map((item) => ({
      itemKey: item.itemKey,
      name: item.name,
      formKey: item.formKey,
    }))
  } catch {
    catalog.value = []
  }
}

const legacyStats = computed(() => [
  { key: 'todo', label: t('workspace.statMyTodo'), value: legacyTotals.value.todo },
  { key: 'initiated', label: t('workspace.statInitiated'), value: legacyTotals.value.initiated },
  { key: 'processed', label: t('workspace.statProcessed'), value: legacyTotals.value.processed },
  { key: 'drafts', label: t('workspace.statDrafts'), value: legacyTotals.value.drafts },
])

async function loadLegacyStats(): Promise<void> {
  const [todo, initiated, processed, drafts] = await Promise.allSettled([
    queryTodoTasks({ pageNum: 1, pageSize: 1 }),
    myInstances({ pageNum: 1, pageSize: 1 }),
    myProcessed({ pageNum: 1, pageSize: 1 }),
    myDrafts({ pageNum: 1, pageSize: 1 }),
  ])
  legacyTotals.value = {
    todo: todo.status === 'fulfilled' ? todo.value.total : 0,
    initiated: initiated.status === 'fulfilled' ? initiated.value.total : 0,
    processed: processed.status === 'fulfilled' ? processed.value.total : 0,
    drafts: drafts.status === 'fulfilled' ? drafts.value.total : 0,
  }
}

async function loadActivity(): Promise<void> {
  try {
    const page = await myInstances({ pageNum: 1, pageSize: 6 })
    initiatedRows.value = page.list as unknown as Array<Record<string, unknown>>
  } catch {
    initiatedRows.value = []
  }
}

async function loadEfficiency(): Promise<void> {
  try {
    analytics.value = await queryAnalyticsSummary()
  } catch {
    analytics.value = null
  }
}

onMounted(async () => {
  try {
    if (props.typeCode === 'todo') await loadTodo()
    else if (props.typeCode === 'stats') await loadLegacyStats()
    else if (props.typeCode === 'favoriteItems') await loadQuick()
    else if (props.typeCode === 'activity') await loadActivity()
    else if (props.typeCode === 'efficiency') await loadEfficiency()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="wsys" :class="`wsys--${typeCode}`">
    <div v-if="loading" class="wsys__empty">{{ t('common.loading') }}</div>

    <template v-else-if="typeCode === 'stats'">
      <div class="wsys__stats">
        <div v-for="item in legacyStats" :key="item.key" class="wsys__stat">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>
    </template>

    <template v-else-if="typeCode === 'todo'">
      <div class="wsys__tabs">
        <button
          v-for="tab in [
            { key: 'todo' as TodoTab, label: t('workspace.tabTodo'), count: todoTotal },
            {
              key: 'processed' as TodoTab,
              label: t('workspace.tabProcessed'),
              count: processedTotal,
            },
            { key: 'cc' as TodoTab, label: t('workspace.tabCc'), count: ccTotal },
          ]"
          :key="tab.key"
          type="button"
          class="wsys__tab"
          :class="{ 'is-active': activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}<span>{{ tab.count }}</span>
        </button>
        <button type="button" class="wsys__more" @click="router.push('/workspace/todo')">
          {{ t('workspace.allTodos') }} →
        </button>
      </div>
      <div v-if="!visibleRows.length" class="wsys__empty">{{ t('workflow.noTodoTasks') }}</div>
      <ul v-else class="wsys__rows">
        <li v-for="(row, index) in visibleRows" :key="index" class="wsys__row">
          <button type="button" class="wsys__row-main" @click="openTask(row)">
            <strong>{{ rowTitle(row) }}</strong>
            <span>{{ rowMeta(row) }}</span>
          </button>
          <button type="button" class="wsys__row-action" @click="openTask(row)">
            {{ t('workspace.handleTask') }}
          </button>
        </li>
      </ul>
    </template>

    <template v-else-if="typeCode === 'favoriteItems'">
      <div v-if="!quickItems.length" class="wsys__empty">{{ t('workspace.noFavorites') }}</div>
      <div v-else class="wsys__quick">
        <button
          v-for="item in quickItems"
          :key="item.itemKey"
          type="button"
          class="wsys__quick-item"
          @click="openForm(item.formKey)"
        >
          {{ item.name }}
        </button>
      </div>
      <p class="wsys__hint">{{ t('workspace.quickLaunchHint') }}</p>
    </template>

    <template v-else-if="typeCode === 'activity'">
      <div v-if="!initiatedRows.length" class="wsys__empty">{{ t('workspace.noActivity') }}</div>
      <ul v-else class="wsys__rows">
        <li v-for="(row, index) in initiatedRows" :key="index" class="wsys__row">
          <span class="wsys__act">
            <strong>{{ rowTitle(row) }}</strong>
            <span>{{ rowMeta(row) }}</span>
          </span>
          <span class="wsys__badge">{{ row.status ?? '—' }}</span>
        </li>
      </ul>
    </template>

    <template v-else-if="typeCode === 'efficiency'">
      <div v-if="!efficiency" class="wsys__empty">{{ t('workspace.noEfficiency') }}</div>
      <template v-else>
        <div class="wsys__metrics">
          <div>
            <span>{{ t('workspace.avgDuration') }}</span>
            <strong>{{ efficiency.avg }}</strong>
          </div>
          <div>
            <span>{{ t('workspace.completionRate') }}</span>
            <strong>{{ efficiency.completion }}</strong>
          </div>
        </div>
        <div class="wsys__boxes">
          <div>
            <span>{{ t('workspace.launched') }}</span
            ><strong>{{ efficiency.launched }}</strong>
          </div>
          <div>
            <span>{{ t('workspace.completed') }}</span
            ><strong>{{ efficiency.completed }}</strong>
          </div>
          <div>
            <span>{{ t('workspace.running') }}</span
            ><strong>{{ efficiency.running }}</strong>
          </div>
        </div>
      </template>
    </template>

    <div v-else class="wsys__empty">{{ t('workspace.legacyCardHint') }}</div>
  </div>
</template>

<style scoped>
/*
 * 数值对齐 Figma「01 工作台 · 页面主体」(265:230)：
 * 字号 14/12、行高 62、按钮 32px、圆角取 --sw-radius-base；颜色与分隔线只引用 --sw-* 全局 token。
 */
.wsys {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: var(--sw-space-8);
}

.wsys--efficiency {
  gap: var(--sw-space-16);
}

.wsys__empty {
  display: grid;
  place-items: center;
  flex: 1;
  min-height: 80px;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.wsys__tabs {
  display: flex;
  align-items: center;
  gap: var(--sw-space-16);
}

.wsys__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sw-space-4);
  height: 32px;
  padding: 0 var(--sw-space-16);
  border: 0;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-color-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.wsys__tab:hover:not(.is-active) {
  background: var(--sw-color-primary-soft);
}

.wsys__tab.is-active {
  background: var(--sw-color-primary);
  color: var(--sw-surface-card);
}

.wsys__tab span {
  color: inherit;
  font-size: inherit;
}

.wsys__more {
  height: 32px;
  margin-left: auto;
  padding: 0 var(--sw-space-12);
  border: 0;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-color-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.wsys__more:hover {
  background: var(--sw-color-primary-soft);
}

.wsys__rows {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
}

.wsys__row {
  display: flex;
  align-items: center;
  gap: var(--sw-space-12);
  min-height: 62px;
  padding: var(--sw-space-8) 0;
  border-bottom: 1px solid var(--sw-border-lighter);
}

.wsys__row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.wsys__row-main strong,
.wsys__act strong {
  overflow: hidden;
  color: var(--sw-text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wsys__row-main span,
.wsys__act span {
  overflow: hidden;
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wsys__row-action {
  height: 32px;
  margin-left: auto;
  padding: 0 var(--sw-space-12);
  border: 0;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-color-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.wsys__row-action:hover {
  background: var(--sw-color-primary-soft);
}

/* 业务动态：标题在左、来源与时间在右，单行 42px */
.wsys--activity .wsys__row {
  min-height: 42px;
  padding: 0;
}

.wsys__act {
  display: flex;
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-16);
  min-width: 0;
}

.wsys--activity .wsys__act strong {
  font-weight: 400;
}

.wsys__badge {
  margin-left: auto;
  padding: 0 var(--sw-space-8);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-page);
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 24px;
}

/* 快捷发起：Secondary 32px 按钮，三列；设计稿行距 32px */
.wsys__quick {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sw-space-32) 10px;
}

.wsys__quick-item {
  height: 32px;
  padding: 0 var(--sw-space-12);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-card);
  color: var(--sw-text-regular);
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
}

.wsys__quick-item:hover {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}

.wsys__hint {
  margin: 0;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.wsys__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sw-space-16);
  align-content: center;
  height: 100%;
}

.wsys__stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wsys__stat span {
  color: var(--sw-text-secondary);
  font-size: 14px;
  line-height: 22px;
}

.wsys__stat strong {
  color: var(--sw-text-primary);
  font-size: 28px;
  font-weight: 700;
  line-height: 36px;
}

.wsys__metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sw-space-20);
}

.wsys__metrics div,
.wsys__boxes div {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-4);
}

.wsys__metrics span,
.wsys__boxes span {
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.wsys__metrics strong {
  color: var(--sw-text-primary);
  font-size: 28px;
  font-weight: 700;
  line-height: 36px;
}

.wsys__boxes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sw-space-20);
  margin-top: auto;
  padding-top: var(--sw-space-16);
  border-top: 1px solid var(--sw-border-lighter);
}

.wsys__boxes strong {
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
</style>

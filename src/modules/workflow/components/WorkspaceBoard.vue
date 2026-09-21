<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * WorkspaceBoard — 工作台画布（v0.0.2 P54 首页 + v0.1.1 BUG-002 低代码编辑）。
 *
 * 设计信息架构：欢迎区 + 四统计卡 + 我的待办面板 + 快捷发起 + 业务动态 + 流程效能。
 * 数据全部来自真实接口：统计=各分页 total；待办/已办/发起/抄送=真实列表；
 * 快捷发起=常用事项；流程效能=/workflow/monitor/analytics/summary（无权限/失败时
 * 以「—」空值收敛，不伪造指标）。徽标/临期计数等设计密度字段仅当接口返回时渲染。
 * 隐藏组件不查询数据；组件配置（显示/顺序/常用事项）经既有布局契约持久化。
 * editable=false（/workspace 首页）只读渲染；editable=true（/workspace/edit 顶层独立
 * 编辑页）所见即所得：真实卡片 + 编辑 chrome（拖拽/缩放/对齐线），保存后主页一致。
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Setting,
  Clock,
  Promotion,
  CircleCheck,
  EditPen,
  ShoppingCart,
  Aim,
  Key,
  MoreFilled,
} from '@element-plus/icons-vue'
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
import { queryAnalyticsSummary } from '@/modules/workflow/api/i4'
import type { WorkspaceCard, WorkspaceCardType, WorkspaceComponent } from '@/contracts/catalog'
import {
  WORKSPACE_MIN_H,
  WORKSPACE_MIN_W,
  WORKSPACE_SNAP,
  applyDragRect,
  collectCandidates,
  dragAxisOffsets,
  snapDelta,
  type CardRect,
} from '@/modules/workflow/utils/workspace-canvas'
import { ApiError } from '@/foundation/request'

const router = useRouter()
const userStore = useUserStore()

// ─── 布局状态 ───
const components = ref<WorkspaceComponent[]>([])
const cardTypes = ref<WorkspaceCardType[]>([])
const favoriteKeys = ref<string[]>([])
const custom = ref(false)
const loading = ref(false)
const dirty = ref(false)
const props = defineProps<{ editable?: boolean }>()

/** 编辑页传 editable；首页只读。 */
const editing = computed(() => props.editable === true)
const paletteVisible = ref(props.editable === true)
const canvasRef = ref<globalThis.HTMLElement | null>(null)
const geometryMap = ref<Record<string, CardRect>>({})
const guides = ref<{ v: number[]; h: number[] }>({ v: [], h: [] })
const draggingPayload = ref('')

/** 自由画布拖拽会话：move=标题栏/卡片体拖动，resize=8 向手柄缩放。 */
type CanvasDragState = {
  key: string
  mode: 'move' | 'resize'
  handle: string
  startX: number
  startY: number
  orig: CardRect
  pointerId: number
  moved: boolean
}
const dragState = ref<CanvasDragState | null>(null)

// ─── 组件数据 ───
type PageExtra = { badge?: string; urgentTotal?: number }
const todoList = ref<Array<Record<string, unknown>>>([])
const processedList = ref<Array<Record<string, unknown>>>([])
const initiatedList = ref<Array<Record<string, unknown>>>([])
const ccList = ref<Array<Record<string, unknown>>>([])
const draftsList = ref<Array<Record<string, unknown>>>([])
const favoriteItems = ref<CatalogItem[]>([])
const todoExtra = ref<PageExtra>({})
const processedExtra = ref<PageExtra>({})
const initiatedExtra = ref<PageExtra>({})

// ─── 问候与真实统计（设计01：统计只使用真实分页 total，不伪造时间/超时维度） ───
const todoTotal = ref(0)
const initiatedTotal = ref(0)
const processedTotal = ref(0)
const draftsTotal = ref(0)
const ccTotal = ref(0)
const draftsExtra = ref<PageExtra>({})

// ─── 流程效能（真实分析摘要；无权限/失败 → null → 空值呈现） ───
const analytics = ref<Awaited<ReturnType<typeof queryAnalyticsSummary>> | null>(null)

const displayName = computed(() => userStore.user?.displayName ?? '')
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return t('workspace.greetingMorning')
  if (hour < 18) return t('workspace.greetingAfternoon')
  return t('workspace.greetingEvening')
})

/** 统计卡图标与底色（视觉取设计01；数值仍全部为真实 total） */
const STAT_ICONS: Record<string, { icon: unknown; bg: string; color: string }> = {
  todo: { icon: Clock, bg: '#f3eeff', color: 'var(--sw-color-primary)' },
  initiated: { icon: Promotion, bg: 'var(--sw-info-bg)', color: 'var(--sw-info)' },
  processed: { icon: CircleCheck, bg: 'var(--sw-success-bg)', color: 'var(--sw-success)' },
  drafts: { icon: EditPen, bg: 'var(--sw-warning-bg)', color: 'var(--sw-warning)' },
}

const stats = computed(() => [
  {
    key: 'todo',
    label: t('workspace.statMyTodo'),
    value: todoTotal.value,
    badge: todoExtra.value.badge,
  },
  {
    key: 'initiated',
    label: t('workspace.statInitiated'),
    value: initiatedTotal.value,
    badge: initiatedExtra.value.badge,
  },
  {
    key: 'processed',
    label: t('workspace.statProcessed'),
    value: processedTotal.value,
    badge: processedExtra.value.badge,
  },
  {
    key: 'drafts',
    label: t('workspace.statDrafts'),
    value: draftsTotal.value,
    badge: draftsExtra.value.badge,
  },
])

/** 待办面板 tabs（设计01）：待办/已办/抄送/草稿 = 四个真实列表，文本 tab + 计数 + 下划线激活态。 */
type TodoPanelTab = 'todo' | 'processed' | 'cc' | 'drafts'
const activeTodoTab = ref<TodoPanelTab>('todo')
const panelTabs = computed(() => [
  { key: 'todo' as const, label: t('workspace.tabTodo'), count: todoTotal.value },
  { key: 'processed' as const, label: t('workspace.tabProcessed'), count: processedTotal.value },
  { key: 'cc' as const, label: t('workflow.cc'), count: ccTotal.value },
  { key: 'drafts' as const, label: t('common.statusDraft'), count: draftsTotal.value },
])
const panelRows = computed(() => {
  switch (activeTodoTab.value) {
    case 'processed':
      return processedList.value
    case 'cc':
      return ccList.value
    case 'drafts':
      return draftsList.value
    default:
      return todoList.value
  }
})

/** 面板行两行式元信息（设计01）：来源 · 人 · 时间（不伪造字段，仅组合真实列） */
function rowMeta(row: Record<string, unknown>): string {
  const base = String(row.action ?? '')
    ? [String(row.action)]
    : [String(row.nodeName ?? row.currentNode ?? ''), String(row.assigneeName ?? '')].filter(
        Boolean,
      )
  const due = String(row.dueText ?? '')
  const meta = (base.length ? base.join(' · ') : '') + (due ? (base.length ? ' · ' : '') + due : '')
  return meta
}

/** 活动时间显示（设计01）：今天→HH:mm，昨天→昨天 HH:mm，其余→MM-DD HH:mm；基于真实时间戳派生。 */
function activityTime(v: unknown): string {
  const s = String(v ?? '')
  if (!s) return ''
  const d = new Date(s.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return s
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000)
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (dayDiff === 0) return hhmm
  if (dayDiff === 1) return `${t('workspace.yesterday')} ${hhmm}`
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hhmm}`
}

/** 业务动态：真实已办/发起/抄送按时间合并（设计01 chips：全部/审批/抄送/消息）。 */
type ActivitySource = 'approval' | 'initiated' | 'cc' | 'message'
const activityFilter = ref<'all' | ActivitySource>('all')
const activityRowsAll = computed(() => {
  const rows: Array<{
    title: string
    meta: string
    time: string
    at: number
    src: ActivitySource
  }> = []
  const timeOf = (v: unknown): number =>
    typeof v === 'string' ? Date.parse(v.replace(' ', 'T')) || 0 : 0
  const activityVisible = components.value.some(
    (c) => rendererKeyOf(c.key) === 'activity' && c.visible,
  )
  if (activityVisible) {
    for (const item of processedList.value) {
      rows.push({
        title: String(item.taskName ?? '-'),
        meta: String(item.action ?? t('workflow.myProcessed')),
        time: activityTime(item.endTime ?? item.createTime),
        at: timeOf(item.endTime ?? item.createTime),
        src: 'approval',
      })
    }
  }
  if (activityVisible) {
    for (const item of initiatedList.value) {
      rows.push({
        title: String(item.processName ?? item.processDefKey ?? '-'),
        meta: String(item.currentNode ?? item.status ?? ''),
        time: activityTime(item.createTime),
        at: timeOf(item.createTime),
        src: 'initiated',
      })
    }
  }
  if (activityVisible) {
    for (const item of ccList.value) {
      rows.push({
        title: String(item.taskName ?? item.formKey ?? '-'),
        meta: String(item.action ?? t('workflow.cc')),
        time: activityTime(item.createTime),
        at: timeOf(item.createTime),
        src: 'cc',
      })
    }
  }
  return rows.sort((a, b) => b.at - a.at).slice(0, 4)
})
const activityRows = computed(() =>
  activityFilter.value === 'all'
    ? activityRowsAll.value
    : activityRowsAll.value.filter((r) => r.src === activityFilter.value),
)
const activityChips = computed(() => [
  { key: 'all' as const, label: t('common.all') },
  { key: 'approval' as const, label: t('workspace.activityApproval') },
  { key: 'cc' as const, label: t('workflow.cc') },
  { key: 'message' as const, label: t('common.message') },
])

/** 快捷发起：常用事项（真实收藏）；图标/底色按序轮换（纯视觉）。 */
const QUICK_ICONS = [Promotion, ShoppingCart, Aim, Setting, Key, MoreFilled]
const QUICK_COLORS = [
  'var(--sw-color-primary)',
  'var(--sw-success)',
  'var(--sw-info)',
  '#545e73',
  'var(--sw-danger)',
  'var(--sw-text-secondary)',
]
const quickActions = computed(() =>
  favoriteItems.value.slice(0, 6).map((item, index) => ({
    label: item.name,
    icon: QUICK_ICONS[index % QUICK_ICONS.length],
    color: QUICK_COLORS[index % QUICK_COLORS.length],
    formKey: item.formKey,
  })),
)

/** 效能面板真实派生值；analytics 为 null 时以「—」呈现。 */
const avgDurationText = computed(() => {
  const ms = analytics.value?.avgDurationMs
  return ms == null ? '—' : `${(ms / 3600000).toFixed(1)} ${t('workspace.hoursUnit')}`
})
/** 平均等待：nodeStats 各节点平均停留的真实均值（无数据 → null → 「—」） */
const avgWaitText = computed(() => {
  const stats = analytics.value?.nodeStats
  if (!stats) return null
  const stays = Object.values(stats)
    .map((s) => s.avgStayMs)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (!stays.length) return null
  return (stays.reduce((a, b) => a + b, 0) / stays.length / 3600000).toFixed(1) + 'h'
})
/** 完成率：completed/launched 真实派生（不伪造「按时」口径） */
const completionPct = computed(() => {
  const a = analytics.value
  if (!a || !a.launched) return null
  const ratio = a.completed / a.launched
  if (!Number.isFinite(ratio)) return null
  return Math.round(ratio * 100)
})
const effBoxes = computed(() => [
  {
    label: t('workspace.statProcessed'),
    value: processedTotal.value ? String(processedTotal.value) : '—',
    color: 'var(--sw-color-primary)',
  },
  {
    label: t('workspace.upcomingDeadline'),
    value: todoExtra.value.urgentTotal != null ? String(todoExtra.value.urgentTotal) : '—',
    color: 'var(--sw-danger)',
  },
  { label: t('workspace.avgWait'), value: avgWaitText.value ?? '—', color: 'var(--sw-success)' },
])

/**
 * 工作台卡片标题的**文案键**（不是求值结果）：渲染期解析，保证语言切换后跟随。
 */
const COMPONENT_TITLE_KEYS: Record<string, string> = {
  todo: 'workflow.myTodoTitle',
  myProcessed: 'workflow.myProcessed',
  myInitiated: 'common.startedByMe',
  cc: 'workflow.cc',
  favoriteItems: 'workflow.favoriteItems',
  drafts: 'common.statusDraft',
  messages: 'common.message',
}

/** 卡片标题显示名：渲染期按当前语言解析。 */
function componentTitle(key: string): string {
  const configured = cardTypes.value.find((type) => type.typeCode === key)
  return configured?.displayName ?? (COMPONENT_TITLE_KEYS[key] ? t(COMPONENT_TITLE_KEYS[key]) : key)
}

function rendererKeyOf(key: string): string {
  return cardTypes.value.find((type) => type.typeCode === key)?.rendererKey ?? key
}

const showTodoPanel = computed(() =>
  components.value.some((c) => rendererKeyOf(c.key) === 'todo' && c.visible),
)
const showStats = computed(() =>
  components.value.some((c) => rendererKeyOf(c.key) === 'stats' && c.visible),
)
const showActivity = computed(() =>
  components.value.some(
    (c) =>
      (rendererKeyOf(c.key) === 'activity' ||
        ['myProcessed', 'myInitiated', 'cc'].includes(c.key)) &&
      c.visible,
  ),
)
async function loadLayout() {
  loading.value = true
  try {
    const resp = await getWorkspaceLayout()
    custom.value = resp.custom
    cardTypes.value = resp.cardTypes ?? []
    const rawCards = (resp.layout.cards ?? resp.layout.components ?? []) as Array<
      WorkspaceCard | WorkspaceComponent
    >
    components.value = withNewComponents(
      rawCards.map((card) => ({
        key: 'typeCode' in card ? card.typeCode : card.key,
        visible: card.visible,
        order: card.order,
        span: card.span,
        metadata: card.metadata,
      })),
    )
    hydrateGeometry()
    favoriteKeys.value = resp.layout.favoriteItemKeys
    await Promise.all([loadComponentData(), loadFavorites(), loadAnalytics()])
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.workspaceLoadFailed'))
  } finally {
    loading.value = false
  }
}

/** 流程效能：真实分析摘要；失败/无权限静默收敛为空值面板（不阻塞整页）。 */
async function loadAnalytics() {
  try {
    analytics.value = await queryAnalyticsSummary()
  } catch {
    analytics.value = null
  }
}

/** 后端卡片类型变化后，用户布局缺失的新类型回落为默认卡片。 */
function withNewComponents(list: WorkspaceComponent[]): WorkspaceComponent[] {
  const keys = new Set(list.map((c) => c.key))
  const merged = [...list]
  const defaults: WorkspaceComponent[] = cardTypes.value.map((type) => ({
    key: type.typeCode,
    visible: true,
    order: type.defaultOrder,
    span: type.defaultSpan,
    metadata: defaultMetadata(type),
  }))
  for (const d of defaults) {
    if (!keys.has(d.key)) merged.push(d)
  }
  return merged
}

function defaultMetadata(type: WorkspaceCardType): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(type.metadataJson || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

// ─── 自由画布几何（整页编辑模式） ───
/** 各渲染器的默认卡片高度；缺省 320 保证面板内容可见。 */
const DEFAULT_CARD_HEIGHTS: Record<string, number> = {
  stats: 168,
  todo: 360,
  favorites: 300,
  activity: 320,
  efficiency: 340,
  drafts: 220,
  messages: 220,
}
const EDGES = ['n', 's', 'e', 'w'] as const
const CORNERS = ['ne', 'nw', 'se', 'sw'] as const

function defaultCardHeight(key: string): number {
  return DEFAULT_CARD_HEIGHTS[rendererKeyOf(key)] ?? 320
}

/** 用户保存的 geometry 存于卡片 metadata.geometry；缺失/非法时回落自动布局。 */
function rectFromMetadata(meta?: Record<string, unknown>): CardRect | null {
  const g = meta?.geometry as Partial<CardRect> | undefined
  if (!g) return null
  const x = Number(g.x)
  const y = Number(g.y)
  const w = Number(g.w)
  const h = Number(g.h)
  if (![x, y, w, h].every((v) => Number.isFinite(v) && v >= 0)) return null
  if (w < WORKSPACE_MIN_W || h < WORKSPACE_MIN_H) return null
  return { x, y, w, h }
}

function hydrateGeometry() {
  for (const component of components.value) {
    const rect = rectFromMetadata(component.metadata)
    if (rect) geometryMap.value[component.key] = rect
  }
}

/** 首次渲染/恢复默认时按 order 生成整行堆叠的默认几何。 */
function ensureGeometry() {
  const width = canvasRef.value?.clientWidth || 1200
  let bottom = 0
  for (const component of [...components.value].sort((a, b) => a.order - b.order)) {
    if (!geometryMap.value[component.key]) {
      geometryMap.value[component.key] = {
        x: 0,
        y: bottom,
        w: Math.max(WORKSPACE_MIN_W, Math.round(width)),
        h: defaultCardHeight(component.key),
      }
    }
    const rect = geometryMap.value[component.key]
    bottom = Math.max(bottom, rect.y + rect.h + 20)
  }
}

function rectOf(key: string): CardRect {
  return geometryMap.value[key] ?? { x: 0, y: 0, w: 1200, h: defaultCardHeight(key) }
}

const canvasItems = computed(() =>
  components.value
    .filter((c) => c.visible || editing.value)
    .slice()
    .sort((a, b) => a.order - b.order),
)

const canvasHeight = computed(() => {
  const bottom = Object.values(geometryMap.value).reduce((max, r) => Math.max(max, r.y + r.h), 0)
  return Math.round(Math.max(editing.value ? 720 : 520, bottom + 80))
})

function itemStyle(key: string) {
  const rect = rectOf(key)
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
    zIndex: dragState.value?.key === key ? 40 : 1,
  }
}

function openDraft(item: Record<string, unknown>) {
  const formKey = String(item.formKey ?? '')
  const draftId = String(item.id ?? '')
  void router.push(`/form/form-render/${formKey}?draftId=${draftId}&mode=draft`)
}

async function loadComponentData() {
  const tasks: Array<Promise<void>> = []
  const needTodo = showTodoPanel.value || showStats.value
  const needProcessed = showTodoPanel.value || showStats.value || showActivity.value
  const needInitiated = showStats.value || showActivity.value
  const needDrafts =
    showTodoPanel.value ||
    showStats.value ||
    components.value.some((c) => rendererKeyOf(c.key) === 'drafts' && c.visible)
  const needCc = showTodoPanel.value || showActivity.value

  if (needTodo) {
    tasks.push(
      queryTodoTasks({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          todoList.value = page.list as unknown as Array<Record<string, unknown>>
          todoTotal.value = page.total
          const extra = page as unknown as PageExtra
          todoExtra.value = { badge: extra.badge, urgentTotal: extra.urgentTotal }
        })
        .catch(() => {
          todoList.value = []
          todoTotal.value = 0
          todoExtra.value = {}
        }),
    )
  }
  if (needProcessed) {
    tasks.push(
      myProcessed({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          processedList.value = page.list as unknown as Array<Record<string, unknown>>
          processedTotal.value = page.total
          processedExtra.value = page as unknown as PageExtra
        })
        .catch(() => {
          processedList.value = []
          processedTotal.value = 0
          processedExtra.value = {}
        }),
    )
  }
  if (needInitiated) {
    tasks.push(
      myInstances({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          initiatedList.value = page.list as unknown as Array<Record<string, unknown>>
          initiatedTotal.value = page.total
          initiatedExtra.value = page as unknown as PageExtra
        })
        .catch(() => {
          initiatedList.value = []
          initiatedTotal.value = 0
          initiatedExtra.value = {}
        }),
    )
  }
  if (needDrafts) {
    tasks.push(
      myDrafts({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          draftsList.value = page.list as unknown as Array<Record<string, unknown>>
          draftsTotal.value = page.total
          draftsExtra.value = page as unknown as PageExtra
        })
        .catch(() => {
          draftsList.value = []
          draftsTotal.value = 0
          draftsExtra.value = {}
        }),
    )
  }
  if (needCc) {
    tasks.push(
      queryMyCopies({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          ccList.value = page.list as unknown as Array<Record<string, unknown>>
          ccTotal.value = page.total
        })
        .catch(() => {
          ccList.value = []
          ccTotal.value = 0
        }),
    )
  }
  await Promise.all(tasks)
}

/** 常用事项仅以当前可见目录解析：失效事项不渲染为入口。 */
async function loadFavorites() {
  if (!components.value.some((c) => rendererKeyOf(c.key) === 'favorites' && c.visible)) {
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

async function loadCatalogChoices() {
  try {
    const page = await queryCatalogItems({ pageNum: 1, pageSize: 100 })
    catalogChoices.value = page.list
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    catalogChoices.value = []
  }
}

/** 小齿轮：首页跳转独立编辑页；编辑页内切换组件库面板。 */
function onGearClick() {
  if (editing.value) {
    paletteVisible.value = !paletteVisible.value
    return
  }
  void router.push('/workspace/edit')
}

function setVisible(component: WorkspaceComponent, value: boolean) {
  component.visible = value
  dirty.value = true
}

function startPaletteDrag(typeCode: string, event: globalThis.DragEvent) {
  draggingPayload.value = `palette:${typeCode}`
  event.dataTransfer?.setData('text/plain', draggingPayload.value)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function isComponentIncluded(typeCode: string): boolean {
  return components.value.some((component) => component.key === typeCode)
}

/** 组件库新增/重新启用卡片：默认半幅宽，落在画布最低端或指针释放处。 */
function addComponent(typeCode: string, at?: { x: number; y: number }) {
  const type = cardTypes.value.find((t) => t.typeCode === typeCode)
  if (!type) return
  const canvasW = canvasRef.value?.clientWidth || 1200
  const w = Math.min(640, Math.max(WORKSPACE_MIN_W, Math.round(canvasW / 2)))
  const h = defaultCardHeight(typeCode)
  const bottom = Object.values(geometryMap.value).reduce((max, r) => Math.max(max, r.y + r.h), 0)
  const pos = at ?? { x: 24, y: bottom + 20 }
  const existing = components.value.find((c) => c.key === typeCode)
  if (existing) {
    existing.visible = true
  } else {
    components.value.push({
      key: typeCode,
      visible: true,
      order: components.value.length + 1,
      span: type.defaultSpan,
      metadata: defaultMetadata(type),
    })
  }
  geometryMap.value[typeCode] = {
    x: Math.max(0, Math.round(pos.x)),
    y: Math.max(0, Math.round(pos.y)),
    w,
    h,
  }
  dirty.value = true
}

function dropPaletteCard(event: globalThis.DragEvent) {
  const payload = event.dataTransfer?.getData('text/plain') || draggingPayload.value
  draggingPayload.value = ''
  if (!payload.startsWith('palette:')) return
  const typeCode = payload.slice('palette:'.length)
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) {
    addComponent(typeCode)
    return
  }
  addComponent(typeCode, {
    x: event.clientX - rect.left - 180,
    y: event.clientY - rect.top - 90,
  })
}

/** 卡片体/标题栏按下进入移动；交互元素（按钮、链接等）不触发拖拽。 */
function startCardDrag(
  event: globalThis.PointerEvent,
  key: string,
  mode: 'move' | 'resize',
  handle = '',
) {
  if (!editing.value || event.button !== 0) return
  const target = event.target as globalThis.HTMLElement | null
  if (mode === 'move' && target?.closest('button, a, input, textarea, select, label')) return
  event.preventDefault()
  dragState.value = {
    key,
    mode,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    orig: { ...rectOf(key) },
    pointerId: event.pointerId,
    moved: false,
  }
  canvasRef.value?.setPointerCapture?.(event.pointerId)
}

function onCanvasPointerMove(event: globalThis.PointerEvent) {
  const st = dragState.value
  if (!st || st.pointerId !== event.pointerId) return
  const dxRaw = event.clientX - st.startX
  const dyRaw = event.clientY - st.startY
  if (!st.moved && Math.hypot(dxRaw, dyRaw) > 2) {
    st.moved = true
    dirty.value = true
  }
  if (!st.moved) return
  const handle = st.mode === 'resize' ? st.handle : ''
  const raw = applyDragRect(st.orig, handle, dxRaw, dyRaw)
  const canvasW = canvasRef.value?.clientWidth ?? 1200
  const others = canvasItems.value.filter((c) => c.key !== st.key).map((c) => rectOf(c.key))
  const offsets = dragAxisOffsets(handle, st.orig)
  const snap = snapDelta(
    raw,
    collectCandidates(others, canvasW, canvasHeight.value),
    offsets.xs,
    offsets.ys,
    WORKSPACE_SNAP,
  )
  geometryMap.value[st.key] = applyDragRect(st.orig, handle, dxRaw + snap.dx, dyRaw + snap.dy)
  guides.value = {
    v: snap.guideX == null ? [] : [snap.guideX],
    h: snap.guideY == null ? [] : [snap.guideY],
  }
}

function onCanvasPointerUp(event: globalThis.PointerEvent) {
  const st = dragState.value
  if (!st || st.pointerId !== event.pointerId) return
  dragState.value = null
  guides.value = { v: [], h: [] }
  canvasRef.value?.releasePointerCapture?.(event.pointerId)
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
      cards: components.value.map((c) => ({
        typeCode: c.key,
        visible: c.visible,
        order: c.order,
        span: c.span === 2 ? 2 : 1,
        metadata: {
          ...(c.metadata ?? {}),
          ...(geometryMap.value[c.key] ? { geometry: geometryMap.value[c.key] } : {}),
        },
      })),
      favoriteItemKeys: [...favoriteKeys.value],
    })
    custom.value = true
    dirty.value = false
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
    await loadLayout()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.layoutRestoreFailed'))
  }
}

onMounted(async () => {
  await loadLayout()
  await nextTick()
  ensureGeometry()
  if (props.editable) void loadCatalogChoices()
})
</script>

<template>
  <div v-loading="loading" class="wsd" :class="{ 'is-editing': editing }">
    <header v-if="!editing" class="wsd-hero">
      <h2 class="wsd-hero__greeting">
        {{ greeting }}{{ displayName ? '，' : '' }}{{ displayName }}
      </h2>
      <p class="wsd-hero__sub">
        {{ t('workspace.todoSummary', { count: todoTotal, urgent: todoExtra.urgentTotal ?? 0 }) }}
      </p>
      <button
        class="wsd-hero__config"
        type="button"
        :title="t('workspace.configureWorkspace')"
        :aria-label="t('workspace.configureWorkspace')"
        @click="onGearClick"
      >
        <el-icon :size="16"><Setting /></el-icon>
      </button>
    </header>

    <div v-if="editing" class="wsd-toolbar">
      <span v-if="!custom" class="wsd-toolbar__badge">{{ t('workspace.defaultLayout') }}</span>
      <p class="wsd-toolbar__hint">{{ t('workspace.canvasHint') }}</p>
      <div class="wsd-toolbar__actions">
        <button class="wsd-btn" type="button" @click="resetConfig">
          {{ t('common.restoreDefault') }}
        </button>
        <button
          class="wsd-btn wsd-btn--primary"
          type="button"
          :disabled="!dirty"
          @click="saveConfig"
        >
          {{ t('workflow.saveWorkspaceConfig') }}
        </button>
        <button class="wsd-btn" type="button" @click="router.push('/workspace')">
          {{ t('workspace.exitEdit') }}
        </button>
      </div>
    </div>

    <div class="wsd-canvas-wrap">
      <aside v-if="editing && paletteVisible" class="wsd-palette">
        <div class="wsd-palette__head">
          <h4>{{ t('workspace.componentLibrary') }}</h4>
          <span>{{ t('workspace.basicComponent') }}</span>
        </div>
        <p class="wsd-palette__hint">{{ t('workspace.componentLibraryHint') }}</p>
        <div class="wsd-palette-list">
          <div
            v-for="type in cardTypes"
            :key="type.typeCode"
            class="wsd-palette-item"
            :class="{ 'is-used': isComponentIncluded(type.typeCode) }"
            draggable="true"
            @dragstart="startPaletteDrag(type.typeCode, $event)"
            @dragend="draggingPayload = ''"
            @click="addComponent(type.typeCode)"
          >
            <span class="wsd-palette-item__grip">⋮⋮</span>
            <span class="wsd-palette-item__body">
              <strong>{{ type.displayName }}</strong>
              <small>{{ type.rendererKey }}</small>
            </span>
            <span class="wsd-palette-item__state">
              {{
                isComponentIncluded(type.typeCode)
                  ? t('workspace.added')
                  : t('workspace.dragToCanvas')
              }}
            </span>
          </div>
        </div>
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
      </aside>

      <div
        ref="canvasRef"
        class="wsd-canvas"
        :class="{ 'is-editing': editing }"
        :style="{ height: canvasHeight + 'px' }"
        @dragover.prevent
        @drop="dropPaletteCard($event)"
        @pointermove="onCanvasPointerMove"
        @pointerup="onCanvasPointerUp"
        @pointercancel="onCanvasPointerUp"
      >
        <template v-if="editing">
          <div
            v-for="(x, index) in guides.v"
            :key="`v${index}`"
            class="wsd-guide wsd-guide--v"
            :style="{ left: x + 'px' }"
          />
          <div
            v-for="(y, index) in guides.h"
            :key="`h${index}`"
            class="wsd-guide wsd-guide--h"
            :style="{ top: y + 'px' }"
          />
        </template>
        <div v-if="canvasItems.length === 0" class="wsd-canvas__empty">
          {{ t('workspace.dropComponentHere') }}
        </div>

        <article
          v-for="component in canvasItems"
          :key="component.key"
          class="wsd-canvas-item"
          :class="{
            'is-hidden': !component.visible,
            'is-dragging': dragState?.key === component.key,
          }"
          :style="itemStyle(component.key)"
          @pointerdown="startCardDrag($event, component.key, 'move')"
        >
          <header
            v-if="editing"
            class="wsd-canvas-item__bar"
            @pointerdown.stop="startCardDrag($event, component.key, 'move')"
          >
            <span class="wsd-canvas-item__grip">⠿</span>
            <strong class="wsd-canvas-item__title">{{ componentTitle(component.key) }}</strong>
            <span class="wsd-canvas-item__renderer">{{ rendererKeyOf(component.key) }}</span>
            <button
              class="wsd-canvas-item__btn"
              type="button"
              @pointerdown.stop
              @click="setVisible(component, !component.visible)"
            >
              {{ component.visible ? t('workspace.visible') : t('workspace.hidden') }}
            </button>
          </header>

          <div class="wsd-canvas-item__body">
            <div v-if="rendererKeyOf(component.key) === 'stats'" class="wsd-stats">
              <div v-for="s in stats" :key="s.key" class="wsd-stat">
                <span class="wsd-stat__label">{{ s.label }}</span>
                <span class="wsd-stat__value">{{ s.value }}</span>
                <span
                  v-if="s.badge"
                  class="wsd-stat__badge"
                  :class="{ 'wsd-stat__badge--indent': s.key === 'drafts' }"
                  >{{ s.badge }}</span
                >
                <span
                  class="wsd-stat__iconbg"
                  :style="{ background: STAT_ICONS[s.key]?.bg, color: STAT_ICONS[s.key]?.color }"
                >
                  <el-icon :size="24"><component :is="STAT_ICONS[s.key]?.icon" /></el-icon>
                </span>
              </div>
            </div>

            <section
              v-else-if="rendererKeyOf(component.key) === 'todo'"
              class="wsd-panel wsd-panel--todo"
            >
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ t('workflow.myTodoTitle') }}</h3>
                <button class="wsd-btn" type="button" @click="router.push('/workflow/todo')">
                  {{ t('workspace.allTodos') }} →
                </button>
              </div>
              <div class="wsd-tabrow" role="tablist">
                <button
                  v-for="tab in panelTabs"
                  :key="tab.key"
                  class="wsd-tab"
                  :class="{ 'is-active': activeTodoTab === tab.key }"
                  type="button"
                  role="tab"
                  :aria-selected="activeTodoTab === tab.key"
                  @click="activeTodoTab = tab.key"
                >
                  {{ tab.label }} <span class="wsd-tab__count">{{ tab.count }}</span>
                </button>
              </div>
              <p v-if="panelRows.length === 0" class="wsd-panel__empty">
                {{ t('workflow.noTodoTasks') }}
              </p>
              <ul v-else class="wsd-taskrows">
                <li v-for="(row, index) in panelRows" :key="index" class="wsd-task">
                  <button
                    class="wsd-task__title"
                    type="button"
                    @click="router.push(`/workflow/task/${(row.taskId as string) ?? ''}`)"
                  >
                    {{ row.name ?? row.taskName ?? row.title ?? (row.formKey as string) ?? '-' }}
                  </button>
                  <span class="wsd-task__meta">{{ rowMeta(row) }}</span>
                </li>
              </ul>
            </section>

            <section
              v-else-if="rendererKeyOf(component.key) === 'favorites'"
              class="wsd-panel wsd-panel--quick"
            >
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ t('workspace.quickLaunch') }}</h3>
                <button class="wsd-pill" type="button" @click="onGearClick">
                  {{ t('workspace.manageFavorites') }}
                </button>
              </div>
              <p v-if="quickActions.length === 0" class="wsd-panel__empty">
                {{ t('workspace.noFavorites') }}
              </p>
              <div v-else class="wsd-quickgrid">
                <button
                  v-for="q in quickActions"
                  :key="q.formKey"
                  class="wsd-quick"
                  type="button"
                  @click="openForm(q.formKey)"
                >
                  <span class="wsd-quick__icon" :style="{ color: q.color }">
                    <el-icon :size="22"><component :is="q.icon" /></el-icon>
                  </span>
                  <span class="wsd-quick__label">{{ q.label }}</span>
                </button>
                <button class="wsd-quick" type="button" @click="onGearClick">
                  <span class="wsd-quick__icon wsd-quick__icon--more">
                    <el-icon :size="22"><MoreFilled /></el-icon>
                  </span>
                  <span class="wsd-quick__label">{{ t('workspace.moreItems') }}</span>
                </button>
              </div>
              <p class="wsd-quick__footer">{{ t('workspace.quickFooter') }}</p>
            </section>

            <section
              v-else-if="rendererKeyOf(component.key) === 'activity'"
              class="wsd-panel wsd-panel--activity"
            >
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ t('workspace.activityTitle') }}</h3>
                <span class="wsd-panel__hint">{{ t('workspace.activityHint') }}</span>
              </div>
              <div class="wsd-chiprow wsd-chiprow--activity">
                <button
                  v-for="c in activityChips"
                  :key="c.key"
                  class="wsd-chip"
                  :class="{ 'is-active': activityFilter === c.key }"
                  type="button"
                  @click="activityFilter = c.key"
                >
                  {{ c.label }}
                </button>
              </div>
              <p v-if="activityRows.length === 0" class="wsd-panel__empty">
                {{ t('workspace.noActivity') }}
              </p>
              <ul v-else class="wsd-actrows">
                <li v-for="(row, index) in activityRows" :key="index" class="wsd-act">
                  <div class="wsd-act__main">
                    <span class="wsd-act__title">{{ row.title }}</span>
                    <span class="wsd-act__meta">{{ row.meta }}</span>
                  </div>
                  <span class="wsd-act__time">{{ row.time }}</span>
                </li>
              </ul>
            </section>

            <section
              v-else-if="rendererKeyOf(component.key) === 'efficiency'"
              class="wsd-panel wsd-panel--eff"
            >
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ t('workspace.efficiencyTitle') }}</h3>
                <span class="wsd-panel__hint">{{ t('workspace.effHint') }}</span>
              </div>
              <div class="wsd-eff-hero">
                <div class="wsd-eff-hero__main">
                  <span class="wsd-eff-hero__label">{{ t('workspace.avgDuration') }}</span>
                  <span class="wsd-eff-hero__value">{{ avgDurationText }}</span>
                </div>
              </div>
              <div class="wsd-eff-rate">
                <div class="wsd-eff-rate__head">
                  <span>{{ t('workspace.completionRate') }}</span>
                  <span class="wsd-eff-rate__num">{{
                    completionPct != null ? completionPct + '%' : '—'
                  }}</span>
                </div>
                <div class="wsd-eff-rate__bar">
                  <span
                    v-if="completionPct != null"
                    class="wsd-eff-rate__fill"
                    :style="{ width: completionPct + '%' }"
                  />
                </div>
              </div>
              <div class="wsd-eff-grid">
                <div v-for="b in effBoxes" :key="b.label" class="wsd-eff-box">
                  <span class="wsd-eff-box__label">{{ b.label }}</span>
                  <span class="wsd-eff-box__value" :style="{ color: b.color }">{{ b.value }}</span>
                </div>
              </div>
            </section>

            <section v-else-if="rendererKeyOf(component.key) === 'drafts'" class="wsd-panel">
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ componentTitle(component.key) }}</h3>
              </div>
              <p v-if="draftsList.length === 0" class="wsd-panel__empty">
                {{ t('workflow.noDrafts') }}
              </p>
              <ul v-else class="wsd-actrows">
                <li v-for="(item, index) in draftsList" :key="index" class="wsd-act">
                  <div class="wsd-act__main">
                    <span class="wsd-act__title">{{ (item.formKey as string) ?? '-' }}</span>
                  </div>
                  <button class="wsd-btn" type="button" @click="openDraft(item)">
                    {{ t('workflow.continueEditing') }}
                  </button>
                </li>
              </ul>
            </section>

            <section v-else-if="rendererKeyOf(component.key) === 'messages'" class="wsd-panel">
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ componentTitle(component.key) }}</h3>
              </div>
              <p class="wsd-panel__empty">{{ t('workflow.messagesEntryHint') }}</p>
              <button class="wsd-btn" type="button" @click="router.push('/notify/record')">
                {{ t('workflow.openMessages') }}
              </button>
            </section>

            <section v-else class="wsd-panel">
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ componentTitle(component.key) }}</h3>
              </div>
              <p class="wsd-panel__empty">{{ t('workspace.basicComponent') }}</p>
            </section>
          </div>

          <template v-if="editing">
            <span
              v-for="edge in EDGES"
              :key="'edge-' + edge"
              class="wsd-edge"
              :class="[
                `wsd-edge--${edge}`,
                {
                  'is-active':
                    dragState?.key === component.key &&
                    dragState?.mode === 'resize' &&
                    dragState?.handle === edge,
                },
              ]"
              @pointerdown.stop="startCardDrag($event, component.key, 'resize', edge)"
            />
            <span
              v-for="corner in CORNERS"
              :key="'corner-' + corner"
              class="wsd-corner"
              :class="`wsd-corner--${corner}`"
              @pointerdown.stop="startCardDrag($event, component.key, 'resize', corner)"
            />
          </template>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 几何对齐设计节点01（figma 21:2）：内容宽 1152，垂直 0/80/208/562 */
.wsd {
  --sw-border: #e1e5ef;
  display: flex;
  flex-direction: column;
  max-width: 1216px;
  padding: 28px 32px 32px;
}
.wsd-hero {
  position: relative;
  height: 64px;
}
.wsd-hero__greeting {
  margin: 2px 0 0;
  font-size: 26px;
  line-height: 28px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-hero__sub {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 28px;
  color: var(--sw-text-secondary);
}
.wsd-hero__config {
  position: absolute;
  right: 0;
  top: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--sw-border);
  border-radius: 50%;
  background: transparent;
  color: var(--sw-text-secondary);
  cursor: pointer;
}
.wsd-hero__config:hover,
.wsd-hero__config:focus-visible {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}
.wsd-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
  padding: 10px 14px;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
  background: #ffffff;
}
.wsd-toolbar__badge {
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  background: #eee8ff;
  color: var(--sw-color-primary);
  font-size: 12px;
}
.wsd-toolbar__hint {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-toolbar__actions {
  display: flex;
  flex: none;
  gap: 8px;
}
.wsd-btn--primary {
  border-color: var(--sw-color-primary);
  background: var(--sw-color-primary);
  color: #ffffff;
}
.wsd-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.wsd-canvas-wrap {
  position: relative;
  margin-top: 12px;
}
.wsd.is-editing {
  max-width: none;
  height: 100vh;
  padding: 14px 20px 18px;
}
.wsd.is-editing .wsd-canvas-wrap {
  display: flex;
  flex: 1;
  gap: 14px;
  align-items: stretch;
  min-height: 0;
}
.wsd.is-editing .wsd-palette {
  position: static;
  flex: 0 0 260px;
  width: 260px;
  box-shadow: none;
}
.wsd.is-editing .wsd-canvas {
  flex: 1;
}
.wsd.is-editing .wsd-canvas-item__body {
  pointer-events: none;
}
.wsd.is-editing .wsd-canvas-item__body > .wsd-panel {
  overflow: hidden;
}
.wsd-canvas {
  position: relative;
  min-height: 520px;
}
.wsd-canvas.is-editing {
  background-image: radial-gradient(circle, #d9deeb 1px, transparent 1px);
  background-size: 24px 24px;
  border: 1px dashed #c6cce0;
  border-radius: 12px;
}
.wsd-canvas__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--sw-text-secondary);
  font-size: 13px;
}
.wsd-canvas-item {
  position: absolute;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.wsd-canvas-item.is-hidden {
  opacity: 0.55;
}
.wsd-canvas-item.is-dragging {
  z-index: 40;
}
.wsd-canvas-item__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  flex: none;
  padding: 0 10px;
  border: 1px solid var(--sw-border);
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  background: #f2ecff;
  cursor: grab;
  user-select: none;
}
.wsd-canvas-item.is-dragging .wsd-canvas-item__bar {
  cursor: grabbing;
}
.wsd-canvas-item__grip {
  color: var(--sw-color-primary);
  letter-spacing: -2px;
}
.wsd-canvas-item__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsd-canvas-item__renderer {
  max-width: 90px;
  overflow: hidden;
  font-size: 11px;
  color: var(--sw-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsd-canvas-item__btn {
  height: 22px;
  flex: none;
  padding: 0 8px;
  border: 1px solid var(--sw-border);
  border-radius: 6px;
  background: #ffffff;
  font-size: 11px;
  color: var(--sw-text-secondary);
  cursor: pointer;
}
.wsd-canvas-item__body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.wsd-canvas-item__body > .wsd-panel {
  height: 100%;
  overflow: auto;
}
.wsd-canvas-item__body > .wsd-stats {
  height: 100%;
}
.wsd-edge {
  position: absolute;
  z-index: 6;
}
.wsd-edge--n {
  top: -3px;
  right: 6px;
  left: 6px;
  height: 7px;
  cursor: ns-resize;
}
.wsd-edge--s {
  right: 6px;
  bottom: -3px;
  left: 6px;
  height: 7px;
  cursor: ns-resize;
}
.wsd-edge--e {
  top: 6px;
  right: -3px;
  bottom: 6px;
  width: 7px;
  cursor: ew-resize;
}
.wsd-edge--w {
  top: 6px;
  bottom: 6px;
  left: -3px;
  width: 7px;
  cursor: ew-resize;
}
.wsd-edge::after {
  content: '';
  position: absolute;
  border-radius: 2px;
  background: var(--sw-color-primary);
  opacity: 0;
  transition: opacity 0.12s ease;
}
.wsd-edge--n::after {
  top: 2px;
  right: 0;
  left: 0;
  height: 2px;
}
.wsd-edge--s::after {
  right: 0;
  bottom: 2px;
  left: 0;
  height: 2px;
}
.wsd-edge--e::after {
  top: 0;
  right: 2px;
  bottom: 0;
  width: 2px;
}
.wsd-edge--w::after {
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
}
.wsd-edge:hover::after,
.wsd-edge.is-active::after {
  opacity: 1;
}
.wsd-corner {
  position: absolute;
  z-index: 7;
  width: 14px;
  height: 14px;
}
.wsd-corner--ne {
  top: -6px;
  right: -6px;
  cursor: nesw-resize;
}
.wsd-corner--nw {
  top: -6px;
  left: -6px;
  cursor: nwse-resize;
}
.wsd-corner--se {
  right: -6px;
  bottom: -6px;
  cursor: nwse-resize;
}
.wsd-corner--sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
}
.wsd-guide {
  position: absolute;
  z-index: 60;
  pointer-events: none;
}
.wsd-guide--v {
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px dashed var(--sw-color-primary);
}
.wsd-guide--h {
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed var(--sw-color-primary);
}
.wsd-palette {
  position: absolute;
  z-index: 70;
  top: 12px;
  bottom: 12px;
  left: 12px;
  width: 248px;
  padding: 16px;
  overflow: auto;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgb(31 42 68 / 12%);
}
.wsd-palette__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.wsd-palette__head h4 {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
  color: var(--sw-text-primary);
}
.wsd-palette__head span {
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  background: #eee8ff;
  color: var(--sw-color-primary);
  font-size: 12px;
}
.wsd-palette__hint {
  margin: 7px 0 14px;
  font-size: 12px;
  line-height: 18px;
  color: var(--sw-text-secondary);
}
.wsd-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
  align-content: start;
}
.wsd-stat {
  position: relative;
  box-sizing: border-box;
  min-height: 96px;
  padding: 18px 20px;
  background: #ffffff;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
}
.wsd-stat__label {
  display: block;
  font-size: 13px;
  line-height: 18px;
  color: var(--sw-text-secondary);
}
.wsd-stat__value {
  display: block;
  margin-top: 6px;
  font-size: 30px;
  line-height: 36px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-stat__badge {
  position: absolute;
  left: 20px;
  bottom: 12px;
  font-size: 12px;
  line-height: 16px;
  color: var(--sw-text-secondary);
}
.wsd-stat__badge--indent {
  left: 32px;
}
.wsd-stat__iconbg {
  position: absolute;
  right: 20px;
  top: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
}
.wsd-panel {
  box-sizing: border-box;
  padding: 20px 24px;
  background: #ffffff;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
}
.wsd-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wsd-panel__head .wsd-btn {
  margin-right: 16px;
}
.wsd-panel--todo .wsd-btn {
  box-sizing: border-box;
  width: 87px;
  padding: 0;
  transform: translateY(-3px);
}
.wsd-panel__head .wsd-pill {
  margin-right: 20px;
}
.wsd-panel__title {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-panel__hint {
  font-size: 14px;
  color: var(--sw-text-secondary);
  margin-right: 6px;
}
.wsd-panel--eff .wsd-panel__hint {
  width: 60px;
  margin-right: 1px;
}
.wsd-panel--activity .wsd-panel__hint {
  width: 80px;
  margin-right: 5px;
  line-height: 28px;
  transform: translateY(3px);
}
.wsd-panel__empty {
  margin: 18px 0 0;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--sw-border);
  border-radius: 6px;
  background: #ffffff;
  font-size: 13px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-pill {
  height: 26px;
  padding: 0 10px;
  margin-top: 4px;
  border: 1px solid var(--sw-border);
  border-radius: 999px;
  background: #ffffff;
  font-size: 11px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-chiprow {
  display: flex;
  gap: 10px;
  margin-top: 13px;
}
.wsd-chip {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 21px;
  border: 1px solid var(--sw-border-light);
  border-radius: 6px;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-chip.is-active {
  border-color: var(--sw-color-primary);
  background: #f2ecff;
  color: var(--sw-color-primary);
  font-weight: 600;
}
.wsd-tabrow {
  display: flex;
  gap: 28px;
  margin-top: 10px;
}
.wsd-tab {
  position: relative;
  border: none;
  background: none;
  padding: 0 0 7px;
  font-size: 14px;
  color: var(--sw-text-secondary);
  cursor: pointer;
}
.wsd-tab__count {
  margin-left: 2px;
}
.wsd-tab.is-active {
  color: var(--sw-color-primary);
  font-weight: 600;
}
.wsd-tab.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--sw-color-primary);
}
.wsd-taskrows {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.wsd-task {
  display: block;
  padding: 12px 15px 14px;
  border-radius: 6px;
}
.wsd-task__title {
  display: block;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: var(--sw-text-primary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsd-task__meta {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  line-height: 16px;
  color: var(--sw-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsd-quickgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px 12px;
  margin-top: 9px;
}
.wsd-quick__icon--more {
  color: var(--sw-text-secondary);
}
.wsd-quick__label {
  width: 96px;
  line-height: 22px;
}
.wsd-quick__footer {
  margin: 14px 0 0;
  padding-top: 12px;
  border-top: 1px solid var(--sw-border-light);
  font-size: 12px;
  color: var(--sw-text-tertiary, var(--sw-text-secondary));
}
.wsd-quick {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 62px;
  padding: 0 17px 0 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
  background: #ffffff;
  font-size: 14px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-actrows {
  list-style: none;
  margin: 3px 0 0;
  padding: 0;
}
.wsd-chiprow--activity {
  margin-left: -4px;
  margin-top: 7px;
  gap: 0;
}
.wsd-act {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 51px;
  padding: 0 16px 0 16px;
  border-radius: 6px;
}
.wsd-act:nth-child(odd) {
  background: #f7f8fc;
}
.wsd-act__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.wsd-act__title {
  font-size: 14px;
  font-weight: 500;
  color: #17213a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsd-act__meta {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-act__time {
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-eff-hero {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 24px;
  margin-top: 9px;
  padding: 16px 18px;
  background: var(--sw-surface-page);
  border: 1px solid #e8e0ff;
  border-radius: 8px;
}
.wsd-eff-hero__label {
  display: block;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-eff-hero__value {
  margin-top: 2px;
  font-size: 28px;
  line-height: 36px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-eff-hero__pill {
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--sw-success-bg);
  color: var(--sw-success);
  font-size: 13px;
  margin-right: 46px;
}
.wsd-eff-rate {
  margin-top: 32px;
}
.wsd-eff-rate__head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #697386;
}
.wsd-eff-rate__num {
  color: var(--sw-success);
  font-weight: 600;
}
.wsd-eff-rate__bar {
  height: 8px;
  margin-top: 8px;
  border-radius: 999px;
  background: #eef0f5;
  overflow: hidden;
}
.wsd-eff-rate__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--sw-success);
}
.wsd-eff-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 9px;
  margin-top: 17px;
}
.wsd-eff-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 10px 12px 10px;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
}
.wsd-eff-box__label {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-eff-box__value {
  font-size: 20px;
  line-height: 24px;
  font-weight: 600;
}
.wsd-palette-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wsd-palette-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 58px;
  padding: 9px 10px;
  border: 1px solid var(--sw-border);
  border-radius: 8px;
  background: #fff;
  cursor: grab;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
.wsd-palette-item:hover,
.wsd-palette-item:focus-visible {
  border-color: var(--sw-color-primary);
  box-shadow: 0 3px 12px rgb(74 43 175 / 10%);
}
.wsd-palette-item.is-used {
  background: #fbfaff;
}
.wsd-palette-item__grip {
  color: var(--sw-text-tertiary, #98a2b3);
  letter-spacing: -3px;
  user-select: none;
}
.wsd-palette-item__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.wsd-palette-item__body strong {
  overflow: hidden;
  color: var(--sw-text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsd-palette-item__body small,
.wsd-palette-item__state {
  color: var(--sw-text-secondary);
  font-size: 11px;
}
.wsd-palette-item__state {
  flex: none;
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

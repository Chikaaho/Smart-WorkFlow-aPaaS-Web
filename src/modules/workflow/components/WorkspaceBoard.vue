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
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Clock, Promotion, CircleCheck, EditPen, Document } from '@element-plus/icons-vue'
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
  WORKSPACE_MIN_W,
  WORKSPACE_NOMINAL_W,
  WORKSPACE_SNAP,
  applyDragRect,
  collectCandidates,
  dragAxisOffsets,
  isLegacyGeometry,
  rescaleRects,
  snapDelta,
  toAbsoluteRect,
  toRelativeRect,
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
const props = defineProps<{ editable?: boolean; embedded?: boolean; configViaDialog?: boolean }>()
const emit = defineEmits<{ configure: [] }>()

/** 编辑页传 editable；首页只读。embedded=嵌入配置弹窗（工具栏按钮归弹窗页脚）。 */
const editing = computed(() => props.editable === true)
const paletteVisible = ref(props.editable === true)
const canvasRef = ref<globalThis.HTMLElement | null>(null)
/** 响应式画布宽度（ResizeObserver 实测）；宽度变化时全部卡片 x/w 等比缩放。 */
const canvasWidth = ref(0)
let canvasResizeObserver: InstanceType<typeof globalThis.ResizeObserver> | null = null
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
const selectedKey = ref<string | null>(null)

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

/** 统计卡图标（设计01：右上简洁小图标，无彩色底块；数值仍全部为真实 total） */
const STAT_ICONS: Record<string, { icon: unknown; bg: string; color: string }> = {
  todo: { icon: Clock, bg: 'transparent', color: 'var(--sw-color-primary)' },
  initiated: { icon: Promotion, bg: 'transparent', color: 'var(--sw-color-primary)' },
  processed: { icon: CircleCheck, bg: 'transparent', color: 'var(--sw-color-primary)' },
  drafts: { icon: EditPen, bg: 'transparent', color: 'var(--sw-color-primary)' },
}

const stats = computed(() => [
  {
    key: 'todo',
    label: t('workspace.statMyTodo'),
    value: todoTotal.value,
    // 设计01：辅助文字右对齐；临期数来自真实分页附加字段（缺省 0，不伪造）
    helper: t('workspace.urgentCount', { count: todoExtra.value.urgentTotal ?? 0 }),
  },
  {
    key: 'initiated',
    label: t('workspace.statInitiated'),
    value: initiatedTotal.value,
    helper: initiatedExtra.value.badge,
  },
  {
    key: 'processed',
    label: t('workspace.statProcessed'),
    value: processedTotal.value,
    helper: processedExtra.value.badge ?? t('workspace.viewRecord'),
  },
  {
    key: 'drafts',
    label: t('workspace.statDrafts'),
    value: draftsTotal.value,
    helper: draftsExtra.value.badge ?? t('workflow.continueEditing'),
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

/** 面板行标题（V012-BUG-021）：优先流程主题，缺省回退流程名称/任务名/标题，末位回退表单标识。 */
function rowTitle(row: Record<string, unknown>): string {
  for (const key of ['theme', 'processName', 'taskName', 'title', 'name']) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return typeof row.formKey === 'string' && row.formKey ? row.formKey : '-'
}

/** 状态/动作翻译（V012-BUG-022）：已知枚举译为人话，未知值原样展示。 */
function statusText(value: unknown): string {
  const key = String(value ?? '')
  const map: Record<string, () => string> = {
    RUNNING: () => t('common.statusInProgress'),
    APPROVED: () => t('common.statusApproved'),
    REJECTED: () => t('common.statusRejected'),
  }
  return map[key]?.() ?? key
}

function actionText(value: unknown): string {
  const key = String(value ?? '')
  const map: Record<string, () => string> = {
    APPROVE: () => t('common.resultAgreed'),
    REJECT: () => t('common.statusRejected'),
    DISAPPROVE: () => t('common.statusRejected'),
  }
  return map[key]?.() ?? key
}

/** 面板行两行式元信息（V012-BUG-021）：流程名称 · 发起人 · 发起时间；真实字段缺失时回退既有节点/动作/到期口径。 */
function rowMeta(row: Record<string, unknown>): string {
  const parts = [
    typeof row.processName === 'string' ? row.processName.trim() : '',
    typeof row.initiatorName === 'string' ? row.initiatorName.trim() : '',
    row.createTime ? activityTime(row.createTime) : '',
  ].filter(Boolean)
  if (parts.length > 0) return parts.join(' · ')
  const base = String(row.action ?? '')
    ? [actionText(row.action)]
    : [String(row.nodeName ?? row.currentNode ?? ''), String(row.assigneeName ?? '')].filter(
        Boolean,
      )
  const due = String(row.dueText ?? '')
  const meta = (base.length ? base.join(' · ') : '') + (due ? (base.length ? ' · ' : '') + due : '')
  return meta
}

/** 设计01 待办行期限标签：仅使用接口真实 `dueText`，无值不渲染（不编造期限）。 */
function dueChip(row: Record<string, unknown>): string {
  const due = row.dueText
  return typeof due === 'string' && due.trim() ? due.trim() : ''
}

/** 待办面板深链：已办页签携带 source=processed，详情页按已办只读渲染并回跳（V012-BUG-001）。 */
function openPanelTask(row: Record<string, unknown>) {
  const taskId = String(row.taskId ?? '')
  if (!taskId) return
  const query = activeTodoTab.value === 'processed' ? { source: 'processed' } : undefined
  void router.push({ path: `/workflow/task/${taskId}`, query })
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
        title: String(
          (typeof item.theme === 'string' && item.theme.trim()) ||
            item.taskName ||
            item.processName ||
            '-',
        ),
        meta:
          [actionText(item.action ?? ''), statusText(item.instanceStatus)]
            .filter((part) => part && part !== 'null')
            .join(' · ') || String(item.action ?? t('workflow.myProcessed')),
        time: activityTime(item.endTime ?? item.createTime),
        at: timeOf(item.endTime ?? item.createTime),
        src: 'approval',
      })
    }
  }
  if (activityVisible) {
    for (const item of initiatedList.value) {
      rows.push({
        title: String(
          (typeof item.theme === 'string' && item.theme.trim()) ||
            item.processName ||
            item.processDefKey ||
            '-',
        ),
        meta: [String(item.currentNode ?? ''), statusText(item.status)].filter(Boolean).join(' · '),
        time: activityTime(item.createTime),
        at: timeOf(item.createTime),
        src: 'initiated',
      })
    }
  }
  if (activityVisible) {
    for (const item of ccList.value) {
      rows.push({
        title: String(item.taskName ?? item.nodeKey ?? item.formKey ?? '-'),
        meta: [t('workflow.cc'), statusText(item.instanceStatus)].filter(Boolean).join(' · '),
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

/** 快捷发起：设计01 文本瓦片，只列真实收藏常用事项。 */
const quickActions = computed(() =>
  favoriteItems.value.slice(0, 5).map((item) => ({
    label: item.name,
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
      rawCards.map((card) => {
        const key = 'typeCode' in card ? card.typeCode : card.key
        return {
          key,
          // 设计01 默认布局只呈现统计/待办/快捷/效能/动态；草稿与消息保留为
          // 组件库能力，默认隐藏，明确自定义布局按用户保存值原样承接。
          visible: custom.value ? card.visible : DESIGN_DEFAULT_TYPES.has(key) && card.visible,
          order: card.order,
          span: card.span,
          metadata: card.metadata,
        }
      }),
      custom.value,
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

/** 设计01 默认页面的五块；其余卡片类型只在自定义布局/编辑面板中启用。 */
const DESIGN_DEFAULT_TYPES = new Set(['stats', 'todo', 'favoriteItems', 'activity', 'efficiency'])

/**
 * 后端卡片类型变化后补默认卡片。
 * - 默认布局：只补设计01 的五块，草稿/消息等不凭空出现在首页；
 * - 用户自定义布局：尊重保存的卡片集合，不把用户主动移除的卡片塞回来。
 */
function withNewComponents(list: WorkspaceComponent[], isCustom: boolean): WorkspaceComponent[] {
  if (isCustom) return [...list]
  const keys = new Set(list.map((c) => c.key))
  const merged = [...list]
  const defaults: WorkspaceComponent[] = cardTypes.value.map((type) => ({
    key: type.typeCode,
    visible: DESIGN_DEFAULT_TYPES.has(type.typeCode),
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
/**
 * 默认画布按设计稿 3:2 分层（内容宽 1656 @1920）：
 * 统计卡 96、主区 112—598（左 1047 / 右 589）、动态通栏 618—878。
 */
const DEFAULT_CARD_GEOMETRY: Record<string, { x: number; y: number; w: number; h: number }> = {
  stats: { x: 0, y: 0, w: 1, h: 96 },
  todo: { x: 0, y: 120, w: 0.632, h: 486 },
  favorites: { x: 0.644, y: 120, w: 0.356, h: 208 },
  efficiency: { x: 0.644, y: 344, w: 0.356, h: 262 },
  activity: { x: 0, y: 621, w: 1, h: 260 },
  drafts: { x: 0, y: 901, w: 0.48, h: 220 },
  messages: { x: 0.52, y: 901, w: 0.48, h: 220 },
}
const EDGES = ['n', 's', 'e', 'w'] as const
const CORNERS = ['ne', 'nw', 'se', 'sw'] as const

function defaultCardHeight(key: string): number {
  return DEFAULT_CARD_HEIGHTS[rendererKeyOf(key)] ?? 320
}

/** 当前画布宽度：真实测量优先，无布局环境（单测）退回名义宽度。 */
function currentCanvasWidth(): number {
  return canvasRef.value?.clientWidth || canvasWidth.value || WORKSPACE_NOMINAL_W
}

/**
 * 用户保存的 geometry 按分数契约（x/w=画布宽度分数，y/h 像素，BUG-003）展开为
 * 当前画布像素；缺失/非法时回落自动布局。BUG-002 旧像素几何先按当前画布钳制，
 * 再按其设计宽度（全部旧卡片最大右缘）等比展开到当前画布——旧布局同样随分辨率自适应。
 */
function hydrateGeometry() {
  const width = currentCanvasWidth()
  const legacyKeys: string[] = []
  for (const component of components.value) {
    const raw = component.metadata?.geometry
    const rect = toAbsoluteRect(raw, width)
    if (rect) {
      geometryMap.value[component.key] = rect
      if (isLegacyGeometry(raw)) legacyKeys.push(component.key)
    }
  }
  if (!legacyKeys.length) return
  const designWidth = legacyKeys.reduce(
    (max, key) => Math.max(max, geometryMap.value[key]!.x + geometryMap.value[key]!.w),
    0,
  )
  if (designWidth < WORKSPACE_MIN_W) return
  const legacyMap: Record<string, CardRect> = {}
  for (const key of legacyKeys) legacyMap[key] = geometryMap.value[key]!
  const scaled = rescaleRects(legacyMap, designWidth, width)
  for (const key of legacyKeys) geometryMap.value[key] = scaled[key] ?? legacyMap[key]!
}

/** 首次渲染/恢复默认时按 order 生成整行堆叠的默认几何。 */
function ensureGeometry() {
  const width = currentCanvasWidth()
  let bottom = 0
  for (const component of [...components.value].sort((a, b) => a.order - b.order)) {
    if (!geometryMap.value[component.key]) {
      const design = DEFAULT_CARD_GEOMETRY[rendererKeyOf(component.key)]
      geometryMap.value[component.key] = design
        ? {
            x: Math.round(width * design.x),
            y: design.y,
            w: Math.max(WORKSPACE_MIN_W, Math.round(width * design.w)),
            h: design.h,
          }
        : {
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
  return geometryMap.value[key] ?? { x: 0, y: 0, w: WORKSPACE_NOMINAL_W, h: defaultCardHeight(key) }
}

const canvasItems = computed(() =>
  components.value
    .filter((c) => c.visible || editing.value)
    .slice()
    .sort((a, b) => a.order - b.order),
)

const canvasHeight = computed(() => {
  // 只按实际呈现的卡片计算高度：隐藏组件不制造底部空白滚动。
  const bottom = canvasItems.value.reduce((max, component) => {
    const r = rectOf(component.key)
    return Math.max(max, r.y + r.h)
  }, 0)
  return Math.round(Math.max(editing.value ? 720 : 520, bottom + (editing.value ? 80 : 24)))
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

/** 小齿轮：编辑态切换组件库面板；首页按配置弹窗/旧路由两种入口分流。 */
function onGearClick() {
  if (editing.value) {
    paletteVisible.value = !paletteVisible.value
    return
  }
  if (props.configViaDialog) {
    emit('configure')
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
  const canvasW = currentCanvasWidth()
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
  selectedKey.value = typeCode
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
  selectedKey.value = key
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

/** 点击空白画布取消选中。 */
function onCanvasPointerDown(event: globalThis.PointerEvent) {
  const target = event.target as globalThis.HTMLElement | null
  if (target?.closest('.wsd-canvas-item')) return
  selectedKey.value = null
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
  const canvasW = currentCanvasWidth()
  try {
    await saveWorkspaceLayout({
      cards: components.value.map((c) => {
        const rect = geometryMap.value[c.key]
        const relative = rect ? toRelativeRect(rect, canvasW) : null
        if (relative) {
          // 持久化契约要求 x/w 落在 0..1；跨编辑/只读画布宽度保存时也不越界。
          relative.x = Math.min(relative.x, Math.max(0, 1 - relative.w))
        }
        return {
          typeCode: c.key,
          visible: c.visible,
          order: c.order,
          span: c.span === 2 ? 2 : 1,
          metadata: {
            ...(c.metadata ?? {}),
            ...(relative ? { geometry: relative } : {}),
          },
        }
      }),
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
    selectedKey.value = null
    await loadLayout()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.layoutRestoreFailed'))
  }
}

/** 配置弹窗页脚复用同一保存/恢复语义；dirty 只在成功保存后归零。 */
defineExpose({ saveConfig, resetConfig, dirty })

onMounted(async () => {
  attachCanvasObserver()
  await loadLayout()
  await nextTick()
  ensureGeometry()
  if (props.editable) void loadCatalogChoices()
})

/** 观察画布实际宽度：分辨率或编辑态组件栏开合变化时等比缩放全部卡片几何。 */
function attachCanvasObserver() {
  const Observer = globalThis.ResizeObserver
  if (!Observer) return
  canvasResizeObserver = new Observer((entries) => {
    const next = Math.round(entries[0]?.contentRect.width ?? 0)
    if (!next || next === canvasWidth.value) return
    const prev = canvasWidth.value
    canvasWidth.value = next
    if (prev > 0) geometryMap.value = rescaleRects(geometryMap.value, prev, next)
  })
  if (canvasRef.value) canvasResizeObserver.observe(canvasRef.value)
}

onBeforeUnmount(() => {
  canvasResizeObserver?.disconnect()
  canvasResizeObserver = null
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
        <span>{{ t('workspace.layoutEntry') }}</span>
      </button>
    </header>

    <div v-if="editing" class="wsd-toolbar">
      <span v-if="!custom" class="wsd-toolbar__badge">{{ t('workspace.defaultLayout') }}</span>
      <div v-if="!embedded" class="wsd-toolbar__actions">
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
        @pointerdown="onCanvasPointerDown"
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
            'is-selected': editing && selectedKey === component.key,
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
                <span v-if="s.helper" class="wsd-stat__badge">{{ s.helper }}</span>
                <span
                  class="wsd-stat__iconbg"
                  :style="{ background: STAT_ICONS[s.key]?.bg, color: STAT_ICONS[s.key]?.color }"
                >
                  <el-icon :size="20"><component :is="STAT_ICONS[s.key]?.icon" /></el-icon>
                </span>
              </div>
            </div>

            <section
              v-else-if="rendererKeyOf(component.key) === 'todo'"
              class="wsd-panel wsd-panel--todo"
            >
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ t('workflow.myTodoTitle') }}</h3>
                <button class="wsd-btn" type="button" @click="router.push('/workspace/todo')">
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
                  <el-icon class="wsd-task__icon" :size="18"><Document /></el-icon>
                  <span class="wsd-task__main">
                    <button class="wsd-task__title" type="button" @click="openPanelTask(row)">
                      {{ rowTitle(row) }}
                    </button>
                    <span class="wsd-task__meta">{{ rowMeta(row) }}</span>
                  </span>
                  <span v-if="dueChip(row)" class="wsd-task__due">{{ dueChip(row) }}</span>
                  <button class="wsd-task__action" type="button" @click="openPanelTask(row)">
                    {{ t('workspace.handleTask') }}
                  </button>
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
                  <span class="wsd-quick__label">{{ q.label }}</span>
                </button>
                <button class="wsd-quick" type="button" @click="onGearClick">
                  <span class="wsd-quick__label">{{ t('workspace.moreItems') }}</span>
                </button>
              </div>
            </section>

            <section
              v-else-if="rendererKeyOf(component.key) === 'activity'"
              class="wsd-panel wsd-panel--activity"
            >
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ t('workspace.activityTitle') }}</h3>
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
              </div>
              <p v-if="activityRows.length === 0" class="wsd-panel__empty">
                {{ t('workspace.noActivity') }}
              </p>
              <ul v-else class="wsd-actrows">
                <li v-for="(row, index) in activityRows" :key="index" class="wsd-act">
                  <span class="wsd-act__title">{{ row.title }}</span>
                  <span class="wsd-act__right">
                    <span class="wsd-act__meta">{{ row.meta }}</span>
                    <span class="wsd-act__time">{{ row.time }}</span>
                  </span>
                </li>
              </ul>
            </section>

            <section
              v-else-if="rendererKeyOf(component.key) === 'efficiency'"
              class="wsd-panel wsd-panel--eff"
            >
              <div class="wsd-panel__head">
                <h3 class="wsd-panel__title">{{ t('workspace.efficiencyTitle') }}</h3>
                <span class="wsd-panel__hint">{{ t('workspace.last7Days') }}</span>
              </div>
              <div class="wsd-eff-top">
                <div class="wsd-eff-metric">
                  <span class="wsd-eff-metric__label">{{ t('workspace.avgDuration') }}</span>
                  <strong class="wsd-eff-metric__value">{{ avgDurationText }}</strong>
                </div>
                <div class="wsd-eff-metric">
                  <span class="wsd-eff-metric__label">{{ t('workspace.completionRate') }}</span>
                  <strong class="wsd-eff-metric__value">{{
                    completionPct != null ? completionPct + '%' : '—'
                  }}</strong>
                </div>
              </div>
              <div class="wsd-eff-bottom">
                <div v-for="b in effBoxes" :key="b.label" class="wsd-eff-box">
                  <span class="wsd-eff-box__label">{{ b.label }}</span>
                  <strong class="wsd-eff-box__value">{{ b.value }}</strong>
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
/* BUG-003：工作台随视口全宽呈现（移除 P53 的 1216px 定宽上限），卡片几何按
   画布宽度分数自适应分辨率；窄屏压缩留白保持可读（≤767px 侧栏由壳层隐藏）。
   Owner 2026-09-22 补充：工作台不允许左右滑动——横向溢出在此硬性收口，
   仅组件较多时允许画布纵向滚动。 */
.wsd {
  --sw-border: #e1e5ef;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  /* 设计01：内容左右 20px、顶部 20px，统计卡顶边与设计 144px 对齐 */
  padding: 20px 20px 24px;
  overflow-x: hidden;
}
@media (max-width: 767px) {
  .wsd {
    padding: 20px 16px 24px;
  }
}
.wsd-hero {
  position: relative;
  height: 60px;
}
.wsd-hero__greeting {
  margin: 0;
  font-size: 26px;
  line-height: 28px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-hero__sub {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--sw-text-secondary);
}
/* 设计01 右上「布局」文字入口（原齿轮图标） */
.wsd-hero__config {
  position: absolute;
  right: 0;
  top: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--sw-color-primary);
  font-size: 14px;
  cursor: pointer;
}
.wsd-hero__config:hover,
.wsd-hero__config:focus-visible {
  background: var(--sw-color-primary-softer);
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
  margin-top: 0;
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
.wsd-canvas-item.is-selected {
  border-color: var(--sw-color-primary);
  box-shadow: 0 0 0 1px var(--sw-color-primary);
}
.wsd-canvas-item.is-selected.is-dragging {
  box-shadow:
    0 0 0 1px var(--sw-color-primary),
    0 12px 30px rgb(31 42 68 / 18%);
}
.wsd-canvas-item.is-selected .wsd-canvas-item__bar {
  background: #e9e0ff;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  align-content: start;
}
.wsd-stat {
  position: relative;
  box-sizing: border-box;
  min-height: 96px;
  padding: 16px 48px 16px 20px;
  background: #ffffff;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
}
.wsd-stat__label {
  display: block;
  overflow-wrap: break-word;
  font-size: 14px;
  line-height: 22px;
  color: var(--sw-text-secondary);
}
.wsd-stat__value {
  display: block;
  margin-top: 2px;
  font-size: 30px;
  line-height: 38px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-stat__badge {
  position: absolute;
  right: 20px;
  bottom: 14px;
  left: auto;
  font-size: 12px;
  line-height: 16px;
  color: var(--sw-text-secondary);
}
.wsd-stat__iconbg {
  position: absolute;
  right: 20px;
  top: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
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
/* 设计01：「全部待办」为无边框文字入口 */
.wsd-panel--todo .wsd-btn {
  box-sizing: border-box;
  width: auto;
  height: auto;
  margin-right: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sw-color-primary);
  transform: none;
}
.wsd-panel__head .wsd-pill {
  margin-right: 0;
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
  width: auto;
  margin-right: 0;
  font-size: 12px;
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
  height: auto;
  padding: 0;
  margin-top: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-size: 14px;
  color: var(--sw-color-primary);
  cursor: pointer;
}
.wsd-chiprow {
  display: flex;
  gap: 4px;
  margin-top: 0;
}
.wsd-chip {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 16px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  color: var(--sw-text-secondary);
}
.wsd-chip.is-active {
  background: var(--sw-color-primary);
  color: #ffffff;
  font-weight: 500;
}
.wsd-tabrow {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.wsd-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 14px;
  color: var(--sw-text-secondary);
  cursor: pointer;
}
.wsd-tab.is-active {
  background: var(--sw-color-primary);
  color: #ffffff;
  font-weight: 500;
}
.wsd-taskrows {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.wsd-task {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-bottom: 1px solid var(--sw-border-light);
}
.wsd-task:last-child {
  border-bottom: 0;
}
.wsd-task__icon {
  color: var(--sw-color-primary);
}
.wsd-task__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.wsd-task__title {
  display: block;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: #17213a;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsd-task__meta {
  display: block;
  font-size: 13px;
  line-height: 18px;
  color: var(--sw-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsd-task__due {
  padding: 4px 10px;
  border-radius: 4px;
  background: #f2ecff;
  color: var(--sw-color-primary);
  font-size: 12px;
  white-space: nowrap;
}
.wsd-task__action {
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--sw-color-primary);
  font-size: 14px;
  cursor: pointer;
}
.wsd-quickgrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 16px;
  margin-top: 12px;
}
.wsd-quick__label {
  width: 100%;
  line-height: 20px;
  text-align: center;
}
.wsd-quick {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: 6px;
  background: #ffffff;
  font-size: 14px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-quick:hover {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}
.wsd-actrows {
  list-style: none;
  margin: 3px 0 0;
  padding: 0;
}
.wsd-chiprow--activity {
  margin-left: 0;
  margin-top: 0;
  gap: 4px;
}
.wsd-actrows {
  margin-top: 8px;
}
.wsd-act {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 51px;
  padding: 0 8px;
  border-bottom: 1px solid var(--sw-border-light);
}
.wsd-act:last-child {
  border-bottom: 0;
}
.wsd-act__title {
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: #17213a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsd-act__right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.wsd-act__meta {
  font-size: 13px;
  color: var(--sw-text-secondary);
  white-space: nowrap;
}
.wsd-act__time {
  font-size: 13px;
  color: var(--sw-text-secondary);
  white-space: nowrap;
}
/* 设计01：效能卡上方双指标、下方三分项，无进度条/彩色边框盒 */
.wsd-eff-top {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 12px;
}
.wsd-eff-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wsd-eff-metric__label {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-eff-metric__value {
  font-size: 28px;
  line-height: 36px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-eff-bottom {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--sw-border-light);
}
.wsd-eff-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0;
  border: 0;
}
.wsd-eff-box__label {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-eff-box__value {
  font-size: 20px;
  line-height: 24px;
  font-weight: 600;
  color: var(--sw-text-primary);
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
  background: var(--sw-color-primary-softer);
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

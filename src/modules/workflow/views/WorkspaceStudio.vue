<script setup lang="ts">
/**
 * WorkspaceStudio — 全屏工作台配置（273:1600 r2）。
 *
 * 三栏：组件库 224 / 12 列画布 / 属性 336；工具栏提供返回、撤销、重置布局、
 * 预览、保存。卡片支持添加、选择、拖动排序、右下角宽高调整、移除；保存沿用
 * /system/workspace/layout，旧版个人布局与首页同源读取。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import {
  getWorkspaceLayout,
  queryCatalogItems,
  saveWorkspaceLayout,
} from '@/modules/workflow/api/oa'
import {
  getWorkspaceFields,
  listWorkspaceSources,
  queryWorkspaceRows,
  type WorkspaceField,
  type WorkspaceFormSource,
  type WorkspaceFilter,
} from '@/modules/workflow/api/workspace-analytics'
import type { CatalogItem, WorkspaceCard } from '@/contracts/catalog'
import {
  DATA_LIBRARY,
  SYSTEM_LIBRARY,
  builtinLabelKey,
  type BuiltinWorkspaceComponent,
} from '../utils/workspace-components'
import {
  GRID_COLUMNS,
  GRID_GAP,
  DESIGN_PRESET_GEOMETRY,
  applyFieldDefaults,
  defaultCard,
  fromWorkspaceCard,
  kindOf,
  packCards,
  pixelRects,
  toWorkspaceCards,
  type PackedRect,
  type StudioCard,
} from '../utils/workspace-studio'
import type { WorkspaceChartType } from '../utils/workspace-data'
import WorkspaceStudioCard from '../components/WorkspaceStudioCard.vue'
import WorkspaceInspector from '../components/WorkspaceInspector.vue'
import WorkspaceFilterDialog from '../components/WorkspaceFilterDialog.vue'
import WorkspaceColumnsDialog from '../components/WorkspaceColumnsDialog.vue'
import WorkspaceMetricsDialog from '../components/WorkspaceMetricsDialog.vue'
import WorkspaceChartTypeDialog from '../components/WorkspaceChartTypeDialog.vue'

const { t } = useI18n()
const router = useRouter()

const loading = ref(true)
const cards = ref<StudioCard[]>([])
const cardTypes = ref<Awaited<ReturnType<typeof getWorkspaceLayout>>['cardTypes']>([])
const favoriteKeys = ref<string[]>([])
const catalogItems = ref<CatalogItem[]>([])
const sources = ref<WorkspaceFormSource[]>([])
const selectedId = ref<string | null>(null)
const fields = ref<WorkspaceField[]>([])
const fieldsLoading = ref(false)
const search = ref('')
const canvasRef = ref<globalThis.HTMLElement | null>(null)
const canvasWidth = ref(0)
const savedSnapshot = ref('[]')
const undoStack = ref<string[]>([])
let lastUndoAt = 0
let resizeObserver: globalThis.ResizeObserver | null = null
let fieldsCache = new Map<string, WorkspaceField[]>()

const filterVisible = ref(false)
const columnsVisible = ref(false)
const metricsVisible = ref(false)
const chartTypeVisible = ref(false)
const previewVisible = ref(false)
const dragCardId = ref('')

const CHART_CODES: Record<WorkspaceChartType, string> = {
  bar: 'chart_bar',
  hbar: 'chart_hbar',
  line: 'chart_line',
  area: 'chart_area',
  combo: 'chart_combo',
  pie: 'chart_pie',
  donut: 'chart_donut',
  scatter: 'chart_scatter',
  radar: 'chart_radar',
  funnel: 'chart_funnel',
  gauge: 'chart_gauge',
  heatmap: 'chart_heatmap',
}

/* 273:1600（执行提示13）：组件库图标按当前蓝色原图 18 项一一对应，#2563EB 线性 20×20。 */
const LIBRARY_ICONS: Record<string, readonly string[]> = {
  todo: [
    'M3.5 5.5L5.5 7.5L9 4',
    'M12 5.5H17',
    'M3.5 12.5L5.5 14.5L9 11',
    'M12 12.5H17',
    'M3.5 5.5',
    'M3.5 12.5',
  ],
  favoriteItems: [
    'M3.5 3.5H8.5V8.5H3.5Z',
    'M11.5 3.5H16.5V8.5H11.5Z',
    'M3.5 11.5H8.5V16.5H3.5Z',
    'M14 11.5V16.5',
    'M11.5 14H16.5',
  ],
  activity: [
    'M3.5 3.5H8.5V8.5H3.5Z',
    'M11.5 3.5H16.5V8.5H11.5Z',
    'M3.5 11.5H8.5V16.5H3.5Z',
    'M11.5 11.5H16.5V16.5H11.5Z',
  ],
  efficiency: [
    'M3.5 3.5H8.5V8.5H3.5Z',
    'M11.5 3.5H16.5V8.5H11.5Z',
    'M3.5 11.5H8.5V16.5H3.5Z',
    'M11.5 11.5H16.5',
    'M11.5 16.5H16.5',
    'M11.5 14H16.5',
  ],
  metric: ['M3.5 16.5H16.5', 'M5.5 16.5V10.5', 'M10 16.5V6.5', 'M14.5 16.5V3.5'],
  chart_bar: ['M3.5 16.5H16.5', 'M6 16.5V9', 'M10 16.5V4', 'M14 16.5V11.5'],
  chart_hbar: ['M3.5 3.5V16.5', 'M3.5 5.5H13', 'M3.5 10H16', 'M3.5 14.5H9.5'],
  chart_line: ['M3.5 3.5V16.5H16.5', 'M5.5 12.5L9.5 8L12.5 10.5L16 5'],
  chart_area: [
    'M3.5 3.5V16.5H16.5',
    'M5.5 13L9 8.5L12 11L16 5.5',
    'M5.5 13L9 8.5L12 11L16 5.5V16.5H5.5',
  ],
  chart_combo: [
    'M3.5 16.5H16.5',
    'M6 16.5V11',
    'M10 16.5V13',
    'M14 16.5V8.5',
    'M4.5 6.5L9 8.5L15.5 3.5',
  ],
  chart_pie: ['M10 10L10 3.5', 'M10 10L15.6 13.2', 'M17 10A7 7 0 1 1 3 10A7 7 0 1 1 17 10Z'],
  chart_donut: ['M17 10A7 7 0 1 1 3 10A7 7 0 1 1 17 10Z', 'M13 10A3 3 0 1 1 7 10A3 3 0 1 1 13 10Z'],
  chart_scatter: [
    'M5.5 6L5.5 6.01',
    'M10.5 12L10.5 12.01',
    'M14.5 7L14.5 7.01',
    'M7 15L7 15.01',
    'M14 14.5L14 14.51',
    'M3.5 16.5H16.5',
  ],
  chart_radar: ['M10 3L16.5 8L14 16L6 16L3.5 8Z', 'M10 7.5L12.8 9.6L11.7 13H8.3L7.2 9.6Z'],
  chart_funnel: ['M4 4H16L12.2 10V14.5L7.8 16.5V10Z'],
  chart_gauge: ['M3.5 13.5A6.5 6.5 0 1 1 16.5 13.5', 'M10 12.5L13.8 8.2', 'M10 12.5L10 12.51'],
  chart_heatmap: [
    'M3.5 3.5H8V8H3.5Z',
    'M12 3.5H16.5V8H12Z',
    'M3.5 12H8V16.5H3.5Z',
    'M12 12H16.5V16.5H12Z',
    'M8 8H12V12H8Z',
  ],
  dataList: [
    'M5.5 5L5.5 5.01',
    'M5.5 10L5.5 10.01',
    'M5.5 15L5.5 15.01',
    'M9 5H16',
    'M9 10H16',
    'M9 15H16',
  ],
}

const contentWidth = computed(() => canvasWidth.value || 1200)

const positions = computed<Record<string, PackedRect>>(() =>
  pixelRects(cards.value, contentWidth.value),
)

const canvasHeight = computed(() => {
  const packed = packCards(cards.value)
  return Math.max(520, packed.height + 32)
})

const selectedCard = computed(
  () => cards.value.find((card) => card.id === selectedId.value) ?? null,
)

const dirty = computed(() => snapshot() !== savedSnapshot.value)
const canUndo = computed(() => undoStack.value.length > 0)

const filteredSystem = computed(() => filterLibrary(SYSTEM_LIBRARY))
const filteredData = computed(() => filterLibrary(DATA_LIBRARY))

function filterLibrary(list: BuiltinWorkspaceComponent[]): BuiltinWorkspaceComponent[] {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return list
  return list.filter((item) =>
    [item.typeCode, t(item.labelKey)].some((text) => text.toLowerCase().includes(keyword)),
  )
}

function labelFor(typeCode: string): string {
  const key = builtinLabelKey(typeCode)
  if (key) return t(key)
  return cardTypes.value.find((type) => type.typeCode === typeCode)?.displayName ?? typeCode
}

function snapshot(): string {
  return JSON.stringify({ cards: cards.value, favoriteKeys: favoriteKeys.value })
}

function restoreSnapshot(raw: string): void {
  const parsed = JSON.parse(raw) as {
    cards?: StudioCard[]
    favoriteKeys?: string[]
  }
  cards.value = parsed.cards ?? []
  favoriteKeys.value = parsed.favoriteKeys ?? []
}

function pushUndo(coalesce = false): void {
  const now = Date.now()
  if (coalesce && undoStack.value.length && now - lastUndoAt < 800) {
    lastUndoAt = now
    return
  }
  undoStack.value.push(snapshot())
  if (undoStack.value.length > 40) undoStack.value.shift()
  lastUndoAt = now
}

function normalizeCard(card: StudioCard): StudioCard {
  if (kindOf(card.typeCode) !== 'chart') return card
  const chartType = card.config.chartType
  if (!chartType) return card
  return {
    ...card,
    typeCode: CHART_CODES[chartType] ?? card.typeCode,
    config: { ...card.config, chartType },
  }
}

function updateCard(card: StudioCard, coalesce = true): void {
  const index = cards.value.findIndex((item) => item.id === card.id)
  if (index < 0) return
  const next = normalizeCard(card)
  if (JSON.stringify(next) === JSON.stringify(cards.value[index])) return
  pushUndo(coalesce)
  cards.value.splice(index, 1, next)
}

function updateSelectedConfig(patch: Partial<StudioCard['config']>): void {
  const card = selectedCard.value
  if (!card) return
  updateCard({ ...card, config: { ...card.config, ...patch } })
}

async function loadFields(formKey: string): Promise<WorkspaceField[]> {
  if (!formKey) return []
  const cached = fieldsCache.get(formKey)
  if (cached) {
    fields.value = cached
    return cached
  }
  fieldsLoading.value = true
  try {
    const resp = await getWorkspaceFields(formKey)
    fieldsCache.set(formKey, resp.fields)
    fields.value = resp.fields
    return resp.fields
  } finally {
    fieldsLoading.value = false
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const [layoutResult, sourceResult, catalogResult] = await Promise.allSettled([
      getWorkspaceLayout(),
      listWorkspaceSources(),
      queryCatalogItems({ pageNum: 1, pageSize: 100 }),
    ])
    if (layoutResult.status !== 'fulfilled') throw layoutResult.reason
    const resp = layoutResult.value
    cardTypes.value = resp.cardTypes ?? []
    favoriteKeys.value = resp.layout.favoriteItemKeys ?? []
    sources.value = sourceResult.status === 'fulfilled' ? sourceResult.value : []
    catalogItems.value = catalogResult.status === 'fulfilled' ? catalogResult.value.list : []
    const raw = (resp.layout.cards ?? resp.layout.components ?? []) as WorkspaceCard[]
    fieldsCache = new Map()
    cards.value = raw
      .filter((card) => card.typeCode)
      .map((card, index) => fromWorkspaceCard(card, index, labelFor))
    if (!cards.value.length) cards.value = defaultCards()
    savedSnapshot.value = snapshot()
    undoStack.value = []
    selectedId.value = cards.value[0]?.id ?? null
    if (selectedId.value) await loadSelectedFields()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workspace.studio.loadFailed'))
  } finally {
    loading.value = false
    await nextTick()
    measureCanvas()
  }
}

function defaultCards(): StudioCard[] {
  const visible = ['stats', 'todo', 'favoriteItems', 'activity', 'efficiency']
  // 默认几何对齐设计 3:2（WorkspaceBoard.DEFAULT_CARD_GEOMETRY 同源）：
  // 统计 96 / 待办 486 / 快捷 208 / 效能 262 / 动态 260。
  return cardTypes.value
    .filter((type) => visible.includes(type.typeCode))
    .map((type) => {
      const card = defaultCard(type.typeCode, type.displayName)
      const preset = DESIGN_PRESET_GEOMETRY[type.typeCode]
      const withPreset = preset ? { ...card, presetGeometry: { ...preset } } : card
      if (type.typeCode === 'stats') return { ...withPreset, span: 12, height: preset?.h ?? 96 }
      if (type.typeCode === 'todo') return { ...withPreset, span: 6, height: preset?.h ?? 486 }
      if (type.typeCode === 'favoriteItems')
        return { ...withPreset, span: 6, height: preset?.h ?? 208 }
      if (type.typeCode === 'activity') return { ...withPreset, span: 12, height: preset?.h ?? 260 }
      return { ...withPreset, span: 6, height: preset?.h ?? 262 }
    })
}

async function loadSelectedFields(): Promise<void> {
  const card = selectedCard.value
  if (!card) {
    fields.value = []
    return
  }
  const formKey = card.config.formKey
  if (!formKey) {
    fields.value = []
    return
  }
  try {
    await loadFields(formKey)
  } catch (err) {
    fields.value = []
    ElMessage.error(err instanceof ApiError ? err.msg : t('workspace.studio.fieldLoadFailed'))
  }
}

watch(selectedId, () => {
  void loadSelectedFields()
})

async function addComponent(item: BuiltinWorkspaceComponent): Promise<void> {
  pushUndo(false)
  const title = t(item.labelKey)
  let card = defaultCard(item.typeCode, title, item.chartType)
  if (kindOf(item.typeCode) !== 'system' && sources.value[0]) {
    const formKey = sources.value[0].formKey
    try {
      const list = await loadFields(formKey)
      card = applyFieldDefaults({ ...card, config: { ...card.config, formKey } }, list)
    } catch {
      card = { ...card, config: { ...card.config, formKey } }
    }
  }
  cards.value.push(card)
  selectedId.value = card.id
  await nextTick()
  const scroll = canvasRef.value?.parentElement
  if (scroll) scroll.scrollTop = scroll.scrollHeight
}

function addByCode(typeCode: string): void {
  const item = [...SYSTEM_LIBRARY, ...DATA_LIBRARY].find((entry) => entry.typeCode === typeCode)
  if (item) void addComponent(item)
}

function onLibraryDragStart(event: globalThis.DragEvent, item: BuiltinWorkspaceComponent): void {
  event.dataTransfer?.setData('text/workspace-library', item.typeCode)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function onCardDragStart(id: string): void {
  dragCardId.value = id
}

function onCardDrop(targetId: string): void {
  if (!dragCardId.value || dragCardId.value === targetId) return
  const from = cards.value.findIndex((card) => card.id === dragCardId.value)
  const to = cards.value.findIndex((card) => card.id === targetId)
  if (from < 0 || to < 0) return
  pushUndo(false)
  const [moved] = cards.value.splice(from, 1)
  cards.value.splice(to, 0, moved)
  // 手动调整后退出设计预设几何，回退 12 列流式排布。
  cards.value.forEach((card) => {
    delete card.presetGeometry
  })
  dragCardId.value = ''
}

function onCanvasDrop(event: globalThis.DragEvent): void {
  const typeCode = event.dataTransfer?.getData('text/workspace-library')
  if (typeCode) {
    addByCode(typeCode)
    return
  }
  if (!dragCardId.value) return
  const from = cards.value.findIndex((card) => card.id === dragCardId.value)
  if (from < 0) return
  pushUndo(false)
  const [moved] = cards.value.splice(from, 1)
  cards.value.push(moved)
  dragCardId.value = ''
}

function removeCard(id: string): void {
  const index = cards.value.findIndex((card) => card.id === id)
  if (index < 0) return
  pushUndo(false)
  cards.value.splice(index, 1)
  if (selectedId.value === id) {
    selectedId.value = cards.value[Math.min(index, cards.value.length - 1)]?.id ?? null
  }
}

interface ResizeState {
  card: StudioCard
  startX: number
  startY: number
  span: number
  height: number
  columnWidth: number
}
let resizeState: ResizeState | null = null

function startResize(event: globalThis.PointerEvent, card: StudioCard): void {
  pushUndo(false)
  const columnWidth = (contentWidth.value - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
  resizeState = {
    card,
    startX: event.clientX,
    startY: event.clientY,
    span: card.span,
    height: card.height,
    columnWidth,
  }
  globalThis.window.addEventListener('pointermove', onResizeMove)
  globalThis.window.addEventListener('pointerup', stopResize)
}

function onResizeMove(event: globalThis.PointerEvent): void {
  if (!resizeState) return
  const deltaX = event.clientX - resizeState.startX
  const deltaY = event.clientY - resizeState.startY
  const spanDelta = Math.round(deltaX / (resizeState.columnWidth + GRID_GAP))
  const span = Math.max(1, Math.min(GRID_COLUMNS, resizeState.span + spanDelta))
  const height = Math.max(120, Math.min(1600, Math.round((resizeState.height + deltaY) / 10) * 10))
  const index = cards.value.findIndex((card) => card.id === resizeState?.card.id)
  if (index < 0) return
  const next = { ...cards.value[index], span, height }
  delete next.presetGeometry
  cards.value.splice(index, 1, next)
}

function stopResize(): void {
  resizeState = null
  globalThis.window.removeEventListener('pointermove', onResizeMove)
  globalThis.window.removeEventListener('pointerup', stopResize)
}

function undo(): void {
  const previous = undoStack.value.pop()
  if (!previous) return
  restoreSnapshot(previous)
  if (!cards.value.some((card) => card.id === selectedId.value)) {
    selectedId.value = cards.value[0]?.id ?? null
  }
}

function toggleFavorite(itemKey: string): void {
  const index = favoriteKeys.value.indexOf(itemKey)
  if (index < 0 && favoriteKeys.value.length >= 20) {
    ElMessage.warning(t('workflow.favoritesLimit'))
    return
  }
  pushUndo(false)
  if (index >= 0) favoriteKeys.value.splice(index, 1)
  else favoriteKeys.value.push(itemKey)
}

async function resetDraft(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('workspace.studio.resetConfirm'),
      t('workspace.studio.resetTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      },
    )
  } catch {
    return
  }
  pushUndo(false)
  cards.value = defaultCards()
  selectedId.value = cards.value[0]?.id ?? null
}

async function save(): Promise<void> {
  const rects = pixelRects(cards.value, contentWidth.value)
  const payload = toWorkspaceCards(cards.value, rects, contentWidth.value)
  try {
    await saveWorkspaceLayout({ cards: payload, favoriteItemKeys: favoriteKeys.value })
    ElMessage.success(t('workspace.studio.saved'))
    await load()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workspace.studio.saveFailed'))
  }
}

async function goBack(): Promise<void> {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm(
        t('workspace.studio.discardConfirm'),
        t('workspace.studio.discardTitle'),
        {
          type: 'warning',
          confirmButtonText: t('workspace.studio.discard'),
          cancelButtonText: t('common.cancel'),
        },
      )
    } catch {
      return
    }
  }
  void router.push('/workspace')
}

async function onFormChange(id: string, formKey: string): Promise<void> {
  const card = cards.value.find((item) => item.id === id)
  if (!card) return
  const baseConfig = {
    ...card.config,
    formKey: formKey || undefined,
    groupBy: undefined,
    groupBy2: undefined,
    metrics: [],
    columns: [],
    sortField: undefined,
    metricField: undefined,
    xField: undefined,
    yField: undefined,
    filters: [],
  }
  if (!formKey) {
    updateCard({ ...card, config: baseConfig })
    fields.value = []
    return
  }
  try {
    const list = await loadFields(formKey)
    updateCard(applyFieldDefaults({ ...card, config: baseConfig }, list))
  } catch (err) {
    updateCard({ ...card, config: baseConfig })
    ElMessage.error(err instanceof ApiError ? err.msg : t('workspace.studio.fieldLoadFailed'))
  }
}

function applyFilters(filters: WorkspaceFilter[]): void {
  updateSelectedConfig({ filters })
}

/* 提示30 Q01（645:28736）：筛选窗真实命中数。
   复用既有只读 /form/workspace/analytics/rows 查询（与列表卡同一端点），
   仅取 pageSize=1 的 total，不拉全量行、不用当前页长度充当总数；
   空条件/加载中/请求失败保持 undefined，弹窗不显示数字、不捏造。 */
const matchCount = ref<number>()
let matchSeq = 0

async function refreshMatchCount(filters: WorkspaceFilter[]): Promise<void> {
  const formKey = selectedCard.value?.config.formKey
  if (!formKey || !filters.length) {
    matchCount.value = undefined
    return
  }
  const seq = ++matchSeq
  try {
    const resp = await queryWorkspaceRows({ formKey, filters, pageNum: 1, pageSize: 1 })
    if (seq === matchSeq) matchCount.value = resp.total
  } catch {
    if (seq === matchSeq) matchCount.value = undefined
  }
}

function applyColumns(columns: StudioCard['config']['columns']): void {
  updateSelectedConfig({ columns })
}

function applyMetrics(patch: Partial<StudioCard['config']>): void {
  const card = selectedCard.value
  if (!card) return
  updateCard({ ...card, config: { ...card.config, ...patch } })
}

function selectChartType(type: WorkspaceChartType): void {
  const card = selectedCard.value
  if (!card) return
  updateCard({
    ...card,
    typeCode: CHART_CODES[type],
    config: { ...card.config, chartType: type },
  })
}

function measureCanvas(): void {
  canvasWidth.value = canvasRef.value?.clientWidth || 0
}

function onKeydown(event: globalThis.KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()
  if (key === 'z') {
    event.preventDefault()
    undo()
  } else if (key === 's') {
    event.preventDefault()
    void save()
  }
}

onMounted(async () => {
  await load()
  if (typeof globalThis.ResizeObserver !== 'undefined' && canvasRef.value) {
    resizeObserver = new globalThis.ResizeObserver(measureCanvas)
    resizeObserver.observe(canvasRef.value)
  }
  globalThis.window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  globalThis.window.removeEventListener('keydown', onKeydown)
  globalThis.window.removeEventListener('pointermove', onResizeMove)
  globalThis.window.removeEventListener('pointerup', stopResize)
})
</script>

<template>
  <div class="wstudio">
    <header class="wstudio__toolbar">
      <div class="wstudio__toolbar-left">
        <button type="button" class="wstudio__back" @click="goBack">
          ← {{ t('workspace.studio.back') }}
        </button>
        <h1>{{ t('workspace.studio.title') }}</h1>
        <span v-if="dirty" class="wstudio__dirty">{{ t('workspace.studio.unsaved') }}</span>
      </div>
      <div class="wstudio__toolbar-right">
        <button type="button" class="wstudio__btn" :disabled="!canUndo" @click="undo">
          {{ t('workspace.studio.undo') }}
        </button>
        <button type="button" class="wstudio__btn" @click="resetDraft">
          {{ t('workspace.studio.reset') }}
        </button>
        <button type="button" class="wstudio__btn" @click="previewVisible = true">
          {{ t('workspace.studio.preview') }}
        </button>
        <button type="button" class="wstudio__btn wstudio__btn--primary" @click="save">
          {{ t('workspace.studio.save') }}
        </button>
      </div>
    </header>

    <div class="wstudio__body">
      <aside class="wstudio__library">
        <h2>{{ t('workspace.studio.library') }}</h2>
        <el-input
          v-model="search"
          size="small"
          :placeholder="t('workspace.studio.searchPlaceholder')"
          clearable
        />
        <section class="wstudio__group">
          <h3>{{ t('workspace.studio.systemCards') }}</h3>
          <div class="wstudio__grid">
            <button
              v-for="item in filteredSystem"
              :key="item.typeCode"
              type="button"
              class="wstudio__item"
              draggable="true"
              @click="addComponent(item)"
              @dragstart="onLibraryDragStart($event, item)"
            >
              <svg class="wstudio__item-icon" viewBox="0 0 20 20" aria-hidden="true">
                <path v-for="(d, di) in LIBRARY_ICONS[item.typeCode]" :key="di" :d="d" />
              </svg>
              <span>{{ t(item.labelKey) }}</span>
            </button>
          </div>
        </section>
        <section class="wstudio__group">
          <h3>{{ t('workspace.studio.dataComponents') }}</h3>
          <div class="wstudio__grid">
            <button
              v-for="item in filteredData"
              :key="item.typeCode"
              type="button"
              class="wstudio__item"
              draggable="true"
              @click="addComponent(item)"
              @dragstart="onLibraryDragStart($event, item)"
            >
              <svg class="wstudio__item-icon" viewBox="0 0 20 20" aria-hidden="true">
                <path v-for="(d, di) in LIBRARY_ICONS[item.typeCode]" :key="di" :d="d" />
              </svg>
              <span>{{ t(item.labelKey) }}</span>
            </button>
          </div>
        </section>
      </aside>

      <main class="wstudio__main">
        <div class="wstudio__canvas-head">
          <h2>{{ t('workspace.studio.canvasTitle') }}</h2>
          <span>{{ t('workspace.studio.canvasHint') }}</span>
        </div>
        <div class="wstudio__canvas-scroll">
          <div
            ref="canvasRef"
            class="wstudio__canvas"
            :style="{ height: `${canvasHeight}px` }"
            @dragover.prevent
            @drop="onCanvasDrop"
          >
            <div class="wstudio__grid-lines" aria-hidden="true" />
            <div v-if="loading" class="wstudio__loading">{{ t('common.loading') }}</div>
            <p v-else-if="!cards.length" class="wstudio__empty">
              {{ t('workspace.studio.empty') }}
            </p>
            <WorkspaceStudioCard
              v-for="card in cards"
              :key="card.id"
              :card="card"
              :rect="positions[card.id] ?? { x: 0, y: 0, w: 300, h: card.height, col: 0, row: 0 }"
              :editable="true"
              :selected="selectedId === card.id"
              :favorite-keys="favoriteKeys"
              @select="selectedId = $event"
              @remove="removeCard"
              @dragstart="onCardDragStart"
              @drop="onCardDrop"
              @resize="startResize"
            />
          </div>
        </div>
      </main>

      <WorkspaceInspector
        v-if="selectedCard"
        :card="selectedCard"
        :sources="sources"
        :fields="fields"
        :fields-loading="fieldsLoading"
        :favorite-keys="favoriteKeys"
        :catalog-items="catalogItems"
        @update="updateCard"
        @remove="removeCard"
        @form-change="onFormChange"
        @toggle-favorite="toggleFavorite"
        @open-filters="filterVisible = true"
        @open-columns="columnsVisible = true"
        @open-metrics="metricsVisible = true"
        @open-chart-type="chartTypeVisible = true"
      />
      <aside v-else class="wstudio__inspector-empty">
        {{ t('workspace.studio.selectHint') }}
      </aside>
    </div>

    <WorkspaceFilterDialog
      v-if="selectedCard"
      v-model="filterVisible"
      :fields="fields"
      :filters="selectedCard.config.filters ?? []"
      :match-count="matchCount"
      @apply="applyFilters"
      @draft-change="refreshMatchCount"
    />
    <WorkspaceColumnsDialog
      v-if="selectedCard"
      v-model="columnsVisible"
      :fields="fields"
      :columns="selectedCard.config.columns ?? []"
      @apply="applyColumns"
    />
    <WorkspaceMetricsDialog
      v-if="selectedCard && selectedCard.config.chartType"
      v-model="metricsVisible"
      :fields="fields"
      :chart-type="selectedCard.config.chartType"
      :config="selectedCard.config"
      @apply="applyMetrics"
    />
    <WorkspaceChartTypeDialog
      v-if="selectedCard"
      v-model="chartTypeVisible"
      :value="selectedCard.config.chartType ?? 'bar'"
      @select="selectChartType"
    />

    <div v-if="previewVisible" class="wstudio__preview">
      <header class="wstudio__toolbar">
        <div class="wstudio__toolbar-left">
          <h1>{{ t('workspace.studio.preview') }}</h1>
          <span class="wstudio__preview-hint">{{ t('workspace.studio.previewHint') }}</span>
        </div>
        <div class="wstudio__toolbar-right">
          <button type="button" class="wstudio__btn" @click="previewVisible = false">
            {{ t('workspace.studio.exitPreview') }}
          </button>
        </div>
      </header>
      <div class="wstudio__preview-scroll">
        <div class="wstudio__preview-stage" :style="{ width: `${contentWidth}px` }">
          <div class="wstudio__canvas-head">
            <h2>{{ t('workspace.studio.canvasTitle') }}</h2>
          </div>
          <div
            class="wstudio__canvas wstudio__canvas--preview"
            :style="{ height: `${canvasHeight}px` }"
          >
            <WorkspaceStudioCard
              v-for="card in cards"
              :key="`preview-${card.id}`"
              :card="card"
              :rect="positions[card.id] ?? { x: 0, y: 0, w: 300, h: card.height, col: 0, row: 0 }"
              :editable="false"
              :selected="false"
              :favorite-keys="favoriteKeys"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wstudio {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--sw-layout-header-height, 64px));
  background: var(--sw-bg-page, #f5f6f8);
  color: var(--sw-text-primary);
}

.wstudio__toolbar {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 56px;
  height: 56px;
  padding: 0 24px;
  border-bottom: 1px solid var(--sw-border-light, #eef0f4);
  background: var(--sw-bg-surface, #fff);
}

.wstudio__toolbar-left,
.wstudio__toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wstudio__toolbar-left h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.wstudio__back {
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--sw-text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.wstudio__back:hover {
  background: var(--sw-bg-muted, #f3f4f6);
}

.wstudio__dirty {
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sw-warning, #f59e0b) 16%, transparent);
  color: var(--sw-warning, #b45309);
  font-size: 11px;
}

.wstudio__btn {
  box-sizing: border-box;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--sw-border, #d9dde6);
  border-radius: 4px;
  background: var(--sw-bg-surface, #fff);
  color: var(--sw-text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.wstudio__btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.wstudio__btn--primary {
  border-color: var(--sw-color-primary, #2563eb);
  background: var(--sw-color-primary, #2563eb);
  color: #fff;
}

.wstudio__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.wstudio__library {
  box-sizing: border-box;
  flex: 0 0 224px;
  width: 224px;
  padding: 16px;
  overflow-y: auto;
  background: var(--sw-bg-surface, #fff);
  border-right: 1px solid var(--sw-border-light, #eef0f4);
}

.wstudio__library h2 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  line-height: 24px;
}

.wstudio__group {
  margin-top: 18px;
}

/* 273:1600：系统首行 y246、数据首行 y396。 */
.wstudio__group:first-of-type {
  margin-top: 21px;
}

.wstudio__group + .wstudio__group {
  margin-top: 17px;
}

.wstudio__group h3 {
  margin: 0 0 8px;
  color: var(--sw-text-tertiary);
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.wstudio__grid {
  display: grid;
  grid-template-columns: repeat(2, 92px);
  /* 273:1600：92×48 按钮、水平 8 / 垂直 12 间距。 */
  gap: 12px 8px;
}

.wstudio__item-icon {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: #2563eb;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.wstudio__item {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 92px;
  height: 48px;
  padding: 4px;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 6px;
  background: var(--sw-bg-surface, #fff);
  color: var(--sw-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.wstudio__item:hover {
  border-color: var(--sw-color-primary, #2563eb);
  color: var(--sw-color-primary, #2563eb);
}

.wstudio__main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.wstudio__canvas-head {
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex: 0 0 68px;
  height: 68px;
  padding: 24px 24px 12px;
}

.wstudio__canvas-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.wstudio__canvas-head span {
  padding-top: 4px;
  color: var(--sw-text-tertiary);
  font-size: 12px;
  line-height: 18px;
}

.wstudio__canvas-scroll {
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 24px 24px;
}

.wstudio__canvas {
  position: relative;
  width: calc(100% - 16px);
  min-height: 520px;
}

.wstudio__grid-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    90deg,
    transparent,
    transparent calc((100% - 176px) / 12),
    color-mix(in srgb, var(--sw-border-light, #eef0f4) 55%, transparent) calc((100% - 176px) / 12),
    color-mix(in srgb, var(--sw-border-light, #eef0f4) 55%, transparent)
      calc((100% - 176px) / 12 + 1px)
  );
  opacity: 0.6;
}

.wstudio__loading,
.wstudio__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--sw-text-tertiary);
  font-size: 12px;
}

.wstudio__inspector-empty {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  flex: 0 0 336px;
  width: 336px;
  border-left: 1px solid var(--sw-border-light, #eef0f4);
  background: var(--sw-bg-surface, #fff);
  color: var(--sw-text-tertiary);
  font-size: 12px;
}

.wstudio__preview {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  background: var(--sw-bg-page, #f5f6f8);
}

.wstudio__preview-hint {
  color: var(--sw-text-tertiary);
  font-size: 11px;
}

.wstudio__preview-scroll {
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px 32px;
}

.wstudio__preview-stage {
  margin: 0 auto;
  max-width: 100%;
}

.wstudio__canvas--preview .grid-lines {
  display: none;
}
</style>

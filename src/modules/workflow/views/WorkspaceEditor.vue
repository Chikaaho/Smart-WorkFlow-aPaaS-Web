<script setup lang="ts">
/**
 * WorkspaceEditor — 工作台编辑页（/workspace/edit，v0.1.1 BUG-002）。
 * 全新独立全屏页面：顶层路由不套主布局壳，自带框架风格编辑器顶栏
 * （AppLogo + 深色令牌）与组件选择侧栏；右侧整块空白画布，基础组件块
 * 自由拖拽定位、悬停 8 向手柄缩放、对齐吸附虚线；几何随布局元数据持久化。
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useI18n } from '@/locales'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppLogo from '@/layouts/components/AppLogo.vue'
import {
  getWorkspaceLayout,
  saveWorkspaceLayout,
  resetWorkspaceLayout,
  queryCatalogItems,
  type CatalogItem,
} from '@/modules/workflow/api/oa'
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

const { t } = useI18n()
const router = useRouter()

const components = ref<WorkspaceComponent[]>([])
const cardTypes = ref<WorkspaceCardType[]>([])
const favoriteKeys = ref<string[]>([])
const custom = ref(false)
const loading = ref(false)
const dirty = ref(false)
const canvasRef = ref<globalThis.HTMLElement | null>(null)
const geometryMap = ref<Record<string, CardRect>>({})
const guides = ref<{ v: number[]; h: number[] }>({ v: [], h: [] })
const draggingPayload = ref('')

/** 自由画布拖拽会话：move=标题栏/块体拖动，resize=8 向手柄缩放。 */
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

const COMPONENT_TITLE_KEYS: Record<string, string> = {
  todo: 'workflow.myTodoTitle',
  myProcessed: 'workflow.myProcessed',
  myInitiated: 'common.startedByMe',
  cc: 'workflow.cc',
  favoriteItems: 'workflow.favoriteItems',
  drafts: 'common.statusDraft',
  messages: 'common.message',
}

function componentTitle(key: string): string {
  const configured = cardTypes.value.find((type) => type.typeCode === key)
  return configured?.displayName ?? (COMPONENT_TITLE_KEYS[key] ? t(COMPONENT_TITLE_KEYS[key]) : key)
}

function rendererKeyOf(key: string): string {
  return cardTypes.value.find((type) => type.typeCode === key)?.rendererKey ?? key
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

const DEFAULT_BLOCK_HEIGHTS: Record<string, number> = {
  stats: 168,
  todo: 360,
  favorites: 300,
  activity: 320,
  efficiency: 340,
  drafts: 220,
  messages: 220,
}
const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const

function defaultBlockHeight(key: string): number {
  return DEFAULT_BLOCK_HEIGHTS[rendererKeyOf(key)] ?? 320
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

/** 首次进入/恢复默认时按 order 生成整行堆叠的默认几何。 */
function ensureGeometry() {
  const width = canvasRef.value?.clientWidth || 1200
  let bottom = 0
  for (const component of [...components.value].sort((a, b) => a.order - b.order)) {
    if (!geometryMap.value[component.key]) {
      geometryMap.value[component.key] = {
        x: 0,
        y: bottom,
        w: Math.max(WORKSPACE_MIN_W, Math.round(width)),
        h: defaultBlockHeight(component.key),
      }
    }
    const rect = geometryMap.value[component.key]
    bottom = Math.max(bottom, rect.y + rect.h + 20)
  }
}

function rectOf(key: string): CardRect {
  return geometryMap.value[key] ?? { x: 0, y: 0, w: 1200, h: defaultBlockHeight(key) }
}

const canvasItems = computed(() => components.value.slice().sort((a, b) => a.order - b.order))

const canvasHeight = computed(() => {
  const bottom = Object.values(geometryMap.value).reduce((max, r) => Math.max(max, r.y + r.h), 0)
  return Math.round(Math.max(720, bottom + 80))
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

const catalogChoices = ref<CatalogItem[]>([])

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
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.workspaceLoadFailed'))
  } finally {
    loading.value = false
  }
}

/** 后端卡片类型变化后，用户布局缺失的新类型回落为默认块。 */
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

async function loadCatalogChoices() {
  try {
    const page = await queryCatalogItems({ pageNum: 1, pageSize: 100 })
    catalogChoices.value = page.list
  } catch {
    ElMessage.error(t('common.loadFailed'))
    catalogChoices.value = []
  }
}

function isComponentIncluded(typeCode: string): boolean {
  return components.value.some((component) => component.key === typeCode)
}

function startPaletteDrag(typeCode: string, event: globalThis.DragEvent) {
  draggingPayload.value = `palette:${typeCode}`
  event.dataTransfer?.setData('text/plain', draggingPayload.value)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

/** 组件库新增/重新启用块：默认半幅宽，落在画布最低端或指针释放处。 */
function addComponent(typeCode: string, at?: { x: number; y: number }) {
  const type = cardTypes.value.find((t) => t.typeCode === typeCode)
  if (!type) return
  const canvasW = canvasRef.value?.clientWidth || 1200
  const w = Math.min(640, Math.max(WORKSPACE_MIN_W, Math.round(canvasW / 2)))
  const h = defaultBlockHeight(typeCode)
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

function setVisible(component: WorkspaceComponent, value: boolean) {
  component.visible = value
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

// ─── 指针拖拽 / 缩放 / 对齐吸附 ───
/** 块体/标题栏按下进入移动；交互元素（按钮等）不触发拖拽。 */
function startNodeDrag(
  event: globalThis.PointerEvent,
  key: string,
  mode: 'move' | 'resize',
  handle = '',
) {
  if (event.button !== 0) return
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
    await nextTick()
    ensureGeometry()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.layoutRestoreFailed'))
  }
}

function exitEditor() {
  void router.push('/workspace')
}

onMounted(async () => {
  await loadLayout()
  await nextTick()
  ensureGeometry()
  void loadCatalogChoices()
})
</script>

<template>
  <div v-loading="loading" class="we">
    <header class="we-topbar">
      <AppLogo :collapse="false" area="portal" />
      <span class="we-topbar__divider" aria-hidden="true" />
      <h1 class="we-topbar__title">{{ t('workspace.editTitle') }}</h1>
      <span v-if="!custom" class="we-topbar__badge">{{ t('workspace.defaultLayout') }}</span>
      <div class="we-topbar__actions">
        <el-button size="small" @click="resetConfig">
          {{ t('common.restoreDefault') }}
        </el-button>
        <el-button size="small" type="primary" :disabled="!dirty" @click="saveConfig">
          {{ t('workflow.saveWorkspaceConfig') }}
        </el-button>
        <el-button size="small" @click="exitEditor">
          {{ t('workspace.exitEdit') }}
        </el-button>
      </div>
    </header>

    <div class="we-body">
      <aside class="we-palette">
        <div class="we-palette__head">
          <h4>{{ t('workspace.componentLibrary') }}</h4>
          <span>{{ t('workspace.basicComponent') }}</span>
        </div>
        <p class="we-palette__hint">{{ t('workspace.componentLibraryHint') }}</p>
        <div class="we-palette-list">
          <div
            v-for="type in cardTypes"
            :key="type.typeCode"
            class="we-palette-item"
            :class="{ 'is-used': isComponentIncluded(type.typeCode) }"
            draggable="true"
            @dragstart="startPaletteDrag(type.typeCode, $event)"
            @dragend="draggingPayload = ''"
            @click="addComponent(type.typeCode)"
          >
            <span class="we-palette-item__grip">⋮⋮</span>
            <span class="we-palette-item__body">
              <strong>{{ type.displayName }}</strong>
              <small>{{ type.rendererKey }}</small>
            </span>
            <span class="we-palette-item__state">
              {{
                isComponentIncluded(type.typeCode)
                  ? t('workspace.added')
                  : t('workspace.dragToCanvas')
              }}
            </span>
          </div>
        </div>
        <div class="we-palette__favorites">
          <h4>{{ t('workflow.favoritesPickerHint') }}</h4>
          <ul>
            <li v-for="item in catalogChoices" :key="item.itemKey">
              <el-checkbox
                :model-value="favoriteKeys.includes(item.itemKey)"
                @change="toggleFavorite(item.itemKey)"
              >
                {{ item.name }}
              </el-checkbox>
            </li>
          </ul>
        </div>
      </aside>

      <main class="we-main">
        <p class="we-main__hint">{{ t('workspace.canvasHint') }}</p>
        <div
          ref="canvasRef"
          class="we-canvas"
          :style="{ height: canvasHeight + 'px' }"
          @dragover.prevent
          @drop="dropPaletteCard($event)"
          @pointermove="onCanvasPointerMove"
          @pointerup="onCanvasPointerUp"
          @pointercancel="onCanvasPointerUp"
        >
          <div
            v-for="(x, index) in guides.v"
            :key="`v${index}`"
            class="we-guide we-guide--v"
            :style="{ left: x + 'px' }"
          />
          <div
            v-for="(y, index) in guides.h"
            :key="`h${index}`"
            class="we-guide we-guide--h"
            :style="{ top: y + 'px' }"
          />
          <div v-if="canvasItems.length === 0" class="we-canvas__empty">
            {{ t('workspace.dropComponentHere') }}
          </div>

          <article
            v-for="component in canvasItems"
            :key="component.key"
            class="we-node"
            :class="{
              'is-hidden': !component.visible,
              'is-dragging': dragState?.key === component.key,
            }"
            :style="itemStyle(component.key)"
            @pointerdown="startNodeDrag($event, component.key, 'move')"
          >
            <header
              class="we-node__bar"
              @pointerdown.stop="startNodeDrag($event, component.key, 'move')"
            >
              <span class="we-node__grip">⠿</span>
              <strong class="we-node__title">{{ componentTitle(component.key) }}</strong>
              <span class="we-node__renderer">{{ rendererKeyOf(component.key) }}</span>
              <button
                class="we-node__btn"
                type="button"
                @pointerdown.stop
                @click="setVisible(component, !component.visible)"
              >
                {{ component.visible ? t('workspace.visible') : t('workspace.hidden') }}
              </button>
            </header>
            <div class="we-node__body">
              <span class="we-node__size">
                {{ rectOf(component.key).w }} × {{ rectOf(component.key).h }}
              </span>
              <div class="we-node__skel" aria-hidden="true">
                <span />
                <span class="we-node__skel-long" />
                <span />
              </div>
            </div>
            <span
              v-for="h in HANDLES"
              :key="h"
              class="we-handle"
              :class="`we-handle--${h}`"
              @pointerdown.stop="startNodeDrag($event, component.key, 'resize', h)"
            />
          </article>
        </div>
      </main>
    </div>
  </div>
</template>
,
<style scoped>
,/* 框架风格：深色顶栏/侧栏令牌与 BasicLayout 同源，画布与节点使用品牌主色。 */,.we {,  display: flex;,  flex-direction: column;,  height: 100vh;,  overflow: hidden;,  background: var(--sw-surface-page);,},.we-topbar {,  box-sizing: border-box;,  display: flex;,  align-items: center;,  gap: 16px;,  flex: 0 0 auto;,  height: var(--sw-layout-header-height);,  padding-right: 20px;,  background: var(--sw-nav-topbar-portal-bg);,  border-bottom: 1px solid #352c88;,},.we-topbar__divider {,  width: 1px;,  height: 24px;,  background: rgb(255 255 255 / 25%);,},.we-topbar__title {,  margin: 0;,  font-size: 16px;,  font-weight: 600;,  color: var(--sw-nav-text);,},.we-topbar__badge {,  padding: 3px 10px;,  border-radius: 999px;,  background: rgb(255 255 255 / 16%);,  color: var(--sw-nav-text);,  font-size: 12px;,},.we-topbar__actions {,  display: flex;,  gap: 8px;,  margin-left: auto;,},.we-body {,  display: flex;,  flex: 1;,  min-height: 0;,},.we-palette {,  box-sizing: border-box;,  display: flex;,  flex: 0 0 248px;,  flex-direction: column;,  width: 248px;,  min-height: 0;,  padding: 16px 14px;,  overflow-y: auto;,  overflow-x: hidden;,  background: var(--sw-nav-sidebar-bg);,  border-right: 1px solid #27345c;,},.we-palette__head {,  display: flex;,  align-items: center;,  justify-content: space-between;,  gap: 8px;,},.we-palette__head h4 {,  margin: 0;,  font-size: 15px;,  line-height: 20px;,  color: var(--sw-nav-text);,},.we-palette__head span {,  flex: none;,  padding: 3px 8px;,  border-radius: 999px;,  background: rgb(255 255 255 / 14%);,  color: var(--sw-nav-text);,  font-size: 12px;,},.we-palette__hint {,  margin: 8px 0 14px;,  font-size: 12px;,  line-height: 18px;,  color: var(--sw-nav-text-secondary);,},.we-palette-list {,  display: flex;,  flex-direction: column;,  gap: 8px;,},.we-palette-item {,  display: flex;,  align-items: center;,  gap: 9px;,  min-height: 56px;,  padding: 9px 10px;,  border: 1px solid #344164;,  border-radius: 8px;,  background: rgb(255 255 255 / 4%);,  cursor: grab;,  transition:,    border-color 0.15s ease,,    background 0.15s ease;,},.we-palette-item:hover,,.we-palette-item:focus-visible {,  border-color: var(--sw-color-primary);,  background: rgb(255 255 255 / 10%);,},.we-palette-item.is-used {,  border-color: var(--sw-color-primary);,},.we-palette-item__grip {,  color: var(--sw-nav-text-secondary);,  letter-spacing: -3px;,  user-select: none;,},.we-palette-item__body {,  display: flex;,  flex: 1;,  flex-direction: column;,  gap: 2px;,  min-width: 0;,},.we-palette-item__body strong {,  overflow: hidden;,  color: var(--sw-nav-text);,  font-size: 13px;,  text-overflow: ellipsis;,  white-space: nowrap;,},.we-palette-item__body small {,  color: var(--sw-nav-text-secondary);,  font-size: 11px;,},.we-palette-item__state {,  flex: none;,  color: var(--sw-nav-text-secondary);,  font-size: 11px;,},.we-palette__favorites {,  margin-top: 18px;,  padding-top: 14px;,  border-top: 1px solid rgb(255 255 255 / 12%);,},.we-palette__favorites h4 {,  margin: 0 0 8px;,  font-size: 13px;,  line-height: 18px;,  color: var(--sw-nav-text);,},.we-palette__favorites ul {,  margin: 0;,  padding: 0;,  list-style: none;,},.we-palette__favorites li {,  padding: 3px 0;,},.we-palette__favorites :deep(.el-checkbox__label) {,  color: var(--sw-nav-text);,},.we-main {,  display: flex;,  flex: 1;,  flex-direction: column;,  gap: 10px;,  min-width: 0;,  min-height: 0;,  padding: 14px 16px 16px;,},.we-main__hint {,  margin: 0;,  font-size: 12px;,  color: var(--sw-text-secondary);,},.we-canvas {,  position: relative;,  flex: none;,  background-color: #ffffff;,  background-image: radial-gradient(circle, #d9deeb 1px, transparent 1px);,  background-size: 24px 24px;,  border: 1px dashed #c6cce0;,  border-radius: 12px;,},.we-guide {,  position: absolute;,  z-index: 60;,  pointer-events: none;,},.we-guide--v {,  top: 0;,  bottom: 0;,  width: 0;,  border-left: 1px dashed var(--sw-color-primary);,},.we-guide--h {,  left: 0;,  right: 0;,  height: 0;,  border-top: 1px dashed var(--sw-color-primary);,},.we-canvas__empty {,  position: absolute;,  inset: 0;,  display: grid;,  place-items: center;,  color: var(--sw-text-secondary);,  font-size: 13px;,},.we-node {,  position: absolute;,  display: flex;,  flex-direction: column;,  box-sizing: border-box;,  background: #ffffff;,  border: 1px solid var(--sw-border);,  border-radius: 10px;,  box-shadow: 0 2px 7px rgb(31 42 68 / 4%);,},.we-node:hover {,  border-color: var(--sw-color-primary);,},.we-node.is-hidden {,  opacity: 0.55;,},.we-node.is-dragging {,  box-shadow: 0 12px 30px rgb(31 42 68 / 18%);,},.we-node__bar {,  display: flex;,  align-items: center;,  gap: 8px;,  height: 34px;,  flex: none;,  padding: 0 10px;,  border-bottom: 1px solid var(--sw-border);,  border-radius: 10px 10px 0 0;,  background: #f2ecff;,  cursor: grab;,  user-select: none;,},.we-node.is-dragging .we-node__bar {,  cursor: grabbing;,},.we-node__grip {,  color: var(--sw-color-primary);,  letter-spacing: -2px;,},.we-node__title {,  flex: 1;,  min-width: 0;,  overflow: hidden;,  font-size: 13px;,  font-weight: 600;,  color: var(--sw-text-primary);,  text-overflow: ellipsis;,  white-space: nowrap;,},.we-node__renderer {,  max-width: 90px;,  overflow: hidden;,  font-size: 11px;,  color: var(--sw-text-secondary);,  text-overflow: ellipsis;,  white-space: nowrap;,},.we-node__btn {,  height: 22px;,  flex: none;,  padding: 0 8px;,  border: 1px solid var(--sw-border);,  border-radius: 6px;,  background: #ffffff;,  font-size: 11px;,  color: var(--sw-text-secondary);,  cursor: pointer;,},.we-node__body {,  position: relative;,  flex: 1;,  min-height: 0;,  padding: 28px 14px 14px;,  overflow: hidden;,},.we-node__size {,  position: absolute;,  top: 8px;,  right: 10px;,  font-size: 11px;,  color: var(--sw-text-tertiary, var(--sw-text-secondary));,},.we-node__skel {,  display: flex;,  flex-direction: column;,  gap: 10px;,},.we-node__skel span {,  display: block;,  width: 42%;,  height: 10px;,  border-radius: 5px;,  background: #eef0f5;,},.we-node__skel span.we-node__skel-long {,  width: 74%;,},.we-handle {,  position: absolute;,  width: 10px;,  height: 10px;,  background: #ffffff;,  border: 1px solid var(--sw-color-primary);,  border-radius: 2px;,  opacity: 0;,  transition: opacity 0.12s ease;,},.we-node:hover .we-handle {,  opacity: 1;,},.we-handle--n {,  top: -5px;,  left: calc(50% - 5px);,  cursor: ns-resize;,},.we-handle--s {,  bottom: -5px;,  left: calc(50% - 5px);,  cursor: ns-resize;,},.we-handle--e {,  right: -5px;,  top: calc(50% - 5px);,  cursor: ew-resize;,},.we-handle--w {,  left: -5px;,  top: calc(50% - 5px);,  cursor: ew-resize;,},.we-handle--ne {,  top: -5px;,  right: -5px;,  cursor: nesw-resize;,},.we-handle--nw {,  top: -5px;,  left: -5px;,  cursor: nwse-resize;,},.we-handle--se {,  bottom: -5px;,  right: -5px;,  cursor: nwse-resize;,},.we-handle--sw {,  bottom: -5px;,  left: -5px;,  cursor: nesw-resize;,},
</style>

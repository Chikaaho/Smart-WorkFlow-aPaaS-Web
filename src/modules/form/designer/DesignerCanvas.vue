<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 画布（设计器中栏）—— 所见即所得（WYSIWYG）。
 *
 * 每个字段渲染成它的**真控件长相**（经 adapters/FormPreview 的 design 态），外面套一层
 * 「壳」承担全部交互：
 *  - 整块壳是选中热区：点控件任意位置 = 选中该字段（真控件 pointer-events:none，事件穿透到壳）；
 *  - hover 出顶栏：删除按钮；字段壳本身支持拖拽排序；
 *  - 控件库拖入走**原生 DnD**：整块画布（含末尾空白）都是放置区，按指针位置算出插入下标，
 *    并在落点把待插入字段**真实渲染**出来（松手即就位）；落点按 24 栅格流式排布，不做自由定位；
 *  - 画布内拖拽排序仍由 SortableJS 接管，真控件不吞事件。
 *
 * 红线：真控件渲染只调 adapters 暴露的 FormPreview（design 态），modules/ 侧画布只管
 * 拖拽/排序/选中/删除的壳，**零 import @form-create/***。
 * V011-BUG-007：hover 条不再展示类型/字段标识文本；保留删除动作。
 */
import { VueDraggable } from 'vue-draggable-plus'
import { Delete } from '@element-plus/icons-vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { DesignerItem } from './types'
import type { FormSchema } from '@/contracts/form-schema'
import FormPreview from '@/adapters/form-designer/FormPreview.vue'
import { FORM_GRID_COLUMNS, getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import { resolveDropIndex, type DropPoint, type DropRect } from './drop-index'
import { resolveResizeColSpan } from './width-steps'
import type { CanvasElement, DragLikeEvent } from './dnd'

const items = defineModel<DesignerItem[]>('items', { required: true })
const selectedId = defineModel<string | null>('selectedId', { required: true })

const props = withDefaults(
  defineProps<{
    /** 已发布表单：禁用拖拽排序、隐藏删除、不响应选中。 */
    readonly?: boolean
    /**
     * SortableJS group 名。缺省 'designer-fields'（主画布）。
     * 盖层子画布传独立 group（如 'designer-subfields'），与主画布拖放严格隔离、互不串。
     */
    group?: string
    /**
     * 组件库拖拽中的待插入字段（原生 DnD 候选）。非空时画布负责算落点、渲染真实预览，
     * 松手后经 add 事件交回宿主插入（画布不持有 items，避免双份真源）。
     */
    pendingItem?: DesignerItem | null
  }>(),
  { readonly: false, group: 'designer-fields', pendingItem: null },
)

const emit = defineEmits<{
  /** 点 TABLE 占位块的「编辑子表」入口：宿主据此打开盖层子画布编辑该子表的子字段。 */
  editTable: [id: string]
  /** 放置落点确认：宿主把 item 插到 index（24 栅格流式顺序，不做自由定位）。 */
  add: [item: DesignerItem, index: number]
}>()

/** TABLE 字段当前子字段数（占位块展示「N 个子字段」）；非 TABLE 恒 0。 */
function subFieldCount(item: DesignerItem): number {
  return item.field.type === 'TABLE' ? item.field.subFields.length : 0
}

/** 打开子表盖层编辑（已发布只读时不响应，宿主入口也已禁用）。 */
function editTable(id: string) {
  if (props.readonly) return
  emit('editTable', id)
}

/**
 * 单字段预览 schema（design 态喂给 FormPreview）。
 * 按 item.id 缓存稳定对象：item.field 在配置回写时被就地 Object.assign（引用不变），
 * 故缓存的 schema.fields[0] 恒等于当前 field，FormPreview 仍能跟随字段深层变更重渲，
 * 而拖拽/选中等父级重渲不会无谓重建 schema（避免子 app 抖动）。
 */
const schemaCache = new Map<string, FormSchema>()
function schemaFor(item: DesignerItem): FormSchema {
  const cached = schemaCache.get(item.id)
  if (cached && cached.fields[0] === item.field) return cached
  const schema: FormSchema = { title: '', fields: [item.field] }
  schemaCache.set(item.id, schema)
  return schema
}

function select(id: string) {
  if (props.readonly) return
  selectedId.value = id
}

function remove(id: string) {
  if (props.readonly) return
  items.value = items.value.filter((it) => it.id !== id)
  schemaCache.delete(id)
  if (selectedId.value === id) selectedId.value = null
}

/* ── BF20261013-016：选中字段左右缘拖拽调宽 ── */

/** 调宽进行中：同步禁用排序拖拽，避免两个手势互相抢事件。 */
const resizing = ref(false)

interface ResizeState {
  item: DesignerItem
  startX: number
  startCols: number
  /** 单列步进（含列距）像素宽：由画布栅格实测，指针位移按它换算列数。 */
  stepPx: number
}

let resizeState: ResizeState | null = null

/** 调宽手柄的指针事件最小结构（同 dnd.ts：.vue 内不写 DOM 全局名）。 */
interface ResizeHandleEvent {
  clientX: number
  currentTarget: unknown
  preventDefault: () => void
  stopPropagation: () => void
}

/** 画布栅格单列步进：优先按列表宽度与列距推算，取不到时退回字段壳自身宽度。 */
function columnStepPx(shell: CanvasElement, cols: number): number {
  const list = shell.parentElement
  const listRect = list?.getBoundingClientRect()
  const rawGap = list ? globalThis.getComputedStyle(list).columnGap : ''
  const gap = Number.parseFloat(rawGap)
  const columnGap = Number.isFinite(gap) ? gap : 0
  if (listRect && listRect.width > 0) {
    return (listRect.width - (FORM_GRID_COLUMNS - 1) * columnGap) / FORM_GRID_COLUMNS + columnGap
  }
  const shellRect = shell.getBoundingClientRect()
  return (shellRect.width + columnGap) / Math.max(cols, 1)
}

function startResize(event: ResizeHandleEvent, item: DesignerItem) {
  if (props.readonly) return
  const handle = event.currentTarget
  const shell = handle instanceof globalThis.HTMLElement ? handle.closest('.field-shell') : null
  if (!(shell instanceof globalThis.HTMLElement)) return
  const startCols = getFormFieldColSpan(item.field)
  resizeState = {
    item,
    startX: event.clientX,
    startCols,
    stepPx: columnStepPx(shell, startCols),
  }
  resizing.value = true
  globalThis.addEventListener('pointermove', onResizeMove)
  globalThis.addEventListener('pointerup', onResizeEnd)
  event.preventDefault()
  event.stopPropagation()
}

function onResizeMove(event: { clientX: number }) {
  const state = resizeState
  if (!state) return
  const next = resolveResizeColSpan(state.startCols, event.clientX - state.startX, state.stepPx)
  if (getFormFieldColSpan(state.item.field) !== next) state.item.field.colSpan = next
}

function onResizeEnd() {
  resizeState = null
  resizing.value = false
  globalThis.removeEventListener('pointermove', onResizeMove)
  globalThis.removeEventListener('pointerup', onResizeEnd)
}

onBeforeUnmount(onResizeEnd)

/* ── 控件库拖入（原生 DnD）：落点解析 + 真实预览 ── */

interface ShellEntry {
  item: DesignerItem
  /** 预览格（尚未进入 items）：不可选中/删除/排序，仅用于展示落点与渲染效果。 */
  pending: boolean
}

/** 画布根：既是放置区，也是落点几何的坐标系。 */
const rootRef = ref<CanvasElement | null>(null)
/** 落点下标；null = 指针不在画布上（不显示预览）。 */
const dropIndex = ref<number | null>(null)

// 新一轮拖拽开始时先清空上一轮的落点与几何快照，预览只在指针真正进入画布后出现。
watch(
  () => props.pendingItem,
  () => {
    dropIndex.value = null
    dragGeometry = null
  },
)

/**
 * BF20261013-004：本轮拖拽的真实字段格几何快照。
 * 预览格渲染会把其他格推移位置——若每次 dragover 实时取矩形，指针不动判定也会随
 * 布局漂移（预览在已有组件间跳位）。拖入期间无排序变更，快照一次即稳定；
 * 自动滚动改变视口时按「页面滚动 + 滚动容器 scrollTop」差值补偿回同一坐标系。
 */
let dragGeometry: { rects: DropRect[]; scrollOffset: number } | null = null

function currentScrollOffset(): number {
  const scroller = scrollContainer()
  return (globalThis.scrollY ?? 0) + (scroller?.scrollTop ?? 0)
}

/**
 * 渲染列表 = 真实字段 + （指针在画布上时的）预览格。
 * 预览格复用同一个壳与同一个 FormPreview，故「拖到哪儿 = 松手后长什么样」在松手前即见。
 */
const shellEntries = computed<ShellEntry[]>(() => {
  const list: ShellEntry[] = items.value.map((item) => ({ item, pending: false }))
  const pending = props.pendingItem
  if (!pending || dropIndex.value === null) return list
  const at = Math.min(Math.max(dropIndex.value, 0), list.length)
  list.splice(at, 0, { item: pending, pending: true })
  return list
})

/** 真实字段格的矩形；排除预览格——预览自身占位会把后续字段推下去，算进去会让落点反复改判。 */
function shellRects(): DropRect[] {
  const root = rootRef.value
  if (!root) return []
  return Array.from(
    root.querySelectorAll<CanvasElement>('.field-shell:not(.field-shell--pending)'),
  ).map((el) => {
    const rect = el.getBoundingClientRect()
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }
  })
}

/**
 * BF20261013-005：拖拽指针接近滚动容器上下边缘时自动滚动。
 * 字段多于一屏时白板卡（overflow-y:auto 祖先）出滚动条，没有这一步指针到不了
 * 下方区域，落点预览与放置都被截断在首屏内。
 */
function scrollContainer(): CanvasElement | null {
  const root = rootRef.value
  let el = root ? root.parentElement : null
  while (el) {
    const overflowY = globalThis.getComputedStyle(el).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return el
    el = el.parentElement
  }
  return null
}

function autoScrollDuringDrag(point: DropPoint) {
  const scroller = scrollContainer()
  if (!scroller) return
  const rect = scroller.getBoundingClientRect()
  const edge = 56
  const step = 24
  if (point.y < rect.top + edge && scroller.scrollTop > 0) {
    scroller.scrollBy({ top: -step })
  } else if (point.y > rect.bottom - edge) {
    scroller.scrollBy({ top: step })
  }
}

/** dragleave 延迟收起挂起的定时器：画布内移动（leave 后必有 dragover）不闪预览。 */
let leaveTimer: ReturnType<typeof globalThis.setTimeout> | null = null

/** dragover 必须 preventDefault 才允许放置；顺带实时更新落点。 */
function onDragOver(event: DragLikeEvent) {
  if (leaveTimer !== null) {
    globalThis.clearTimeout(leaveTimer)
    leaveTimer = null
  }
  if (props.readonly || !props.pendingItem) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  const point = { x: event.clientX, y: event.clientY }
  autoScrollDuringDrag(point)
  if (!dragGeometry) dragGeometry = { rects: shellRects(), scrollOffset: currentScrollOffset() }
  // 快照存的是视口坐标：scrollTop 增加 = 内容在视口中上移，故按 -shift 平移
  const shift = currentScrollOffset() - dragGeometry.scrollOffset
  const rects =
    shift === 0
      ? dragGeometry.rects
      : dragGeometry.rects.map((r) => ({ ...r, top: r.top - shift, bottom: r.bottom - shift }))
  const next = resolveDropIndex(rects, point)
  if (next !== dropIndex.value) dropIndex.value = next
}

/**
 * 指针移出画布就收起预览；几何快照**不**在这里清。
 * 原因（BF20261013-004）：拖拽中预览渲染/自动滚动会让指针下的节点更替，浏览器派发
 * dragleave——Chrome 对这类事件往往不回传坐标（clientX/Y=0），无论按 relatedTarget
 * 还是坐标判「真离开」都会误清快照，落点判定随即随重建后的布局漂移（预览在组件间跳位）。
 * 快照只在两处重置：新一轮拖拽（watch pendingItem）与 drop——期间残留无害：
 * dragover 只在画布根上触发，画布外的停留不产生任何判定。
 */
function onDragLeave() {
  if (leaveTimer !== null) globalThis.clearTimeout(leaveTimer)
  leaveTimer = globalThis.setTimeout(() => {
    leaveTimer = null
    dropIndex.value = null
  }, 120)
}

/** 放置：按落点交给宿主插入（流式顺序，不做自由定位）。 */
function onDrop(event: DragLikeEvent) {
  const pending = props.pendingItem
  if (props.readonly || !pending) return
  event.preventDefault()
  const at = Math.min(Math.max(dropIndex.value ?? items.value.length, 0), items.value.length)
  dropIndex.value = null
  dragGeometry = null
  emit('add', pending, at)
}

/** 预览格不是真实字段：点击不改变选中态。 */
function onShellClick(entry: ShellEntry) {
  if (entry.pending) return
  select(entry.item.id)
}
</script>

<template>
  <!-- 整块画布（含末尾空白）都是放置区：dragover/drop 挂在根上，不局限在字段列表高度内 -->
  <section
    ref="rootRef"
    class="canvas"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <VueDraggable
      v-model="items"
      :group="{ name: group, pull: true, put: true }"
      :animation="150"
      :force-fallback="true"
      :fallback-on-body="true"
      :fallback-tolerance="4"
      filter=".field-shell--pending"
      item-key="id"
      class="canvas__list"
      :disabled="readonly || resizing"
    >
      <div
        v-for="entry in shellEntries"
        :key="entry.item.id"
        class="field-shell"
        :class="{
          'field-shell--active': !entry.pending && entry.item.id === selectedId,
          'field-shell--pending': entry.pending,
        }"
        :style="{ gridColumn: `span ${getFormFieldColSpan(entry.item.field)}` }"
        :data-col-span="getFormFieldColSpan(entry.item.field)"
        :data-field-type="entry.item.field.type"
        :data-field-name="entry.item.field.name"
        @click="onShellClick(entry)"
      >
        <!-- V011-BUG-007：hover 条只保留删除动作；类型/字段标识文本不再悬浮展示；预览格无操作条
            （V011-BUG-008：选中档位徽标同步移除，宽度在右侧属性面板查看） -->
        <div v-if="!entry.pending" class="field-shell__bar">
          <el-button
            v-if="!readonly"
            class="field-shell__del"
            link
            type="danger"
            :icon="Delete"
            :title="t('form.deleteField')"
            @click.stop="remove(entry.item.id)"
          />
        </div>
        <!-- BF20261013-016：选中后拖右缘调宽（手柄只在选中态出现；Owner：左边不需要拖动） -->
        <span
          v-if="!entry.pending && !readonly && entry.item.id === selectedId"
          class="field-shell__resize field-shell__resize--right"
          :title="t('form.resizeWidthHint')"
          @pointerdown="startResize($event, entry.item)"
          @mousedown.stop.prevent
          @click.stop
        />
        <!-- TABLE：占位块 + 「编辑子表」入口（不真渲染内部表格、不发请求）；其余字段走真控件长相。 -->
        <div class="field-shell__control">
          <div v-if="entry.item.field.type === 'TABLE'" class="field-shell__table">
            <div class="field-shell__table-info">
              <span class="field-shell__table-label">{{
                entry.item.field.label || entry.item.field.name
              }}</span>
              <span class="field-shell__table-count">{{
                t('form.subFieldCountLabel', { count: subFieldCount(entry.item) })
              }}</span>
            </div>
            <el-button
              class="field-shell__table-edit"
              size="small"
              :disabled="readonly || entry.pending"
              @click.stop="editTable(entry.item.id)"
            >
              {{ t('form.editSubTable') }}
            </el-button>
          </div>
          <!-- 真控件长相（design 态 pointer-events:none，整块作为选中热区） -->
          <FormPreview v-else :schema="schemaFor(entry.item)" mode="design" />
        </div>
      </div>
    </VueDraggable>

    <p v-if="items.length === 0" class="canvas__empty">{{ t('form.canvasEmptyHint') }}</p>
  </section>
</template>

<style scoped>
.canvas {
  /* 纵向排布：字段列表撑满画布 → 整块白板都是放置区（末尾空白也能落点） */
  display: flex;
  flex-direction: column;
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--sw-space-20) var(--sw-space-24);
  background: var(--sw-fill-base);
  overflow-y: auto;
}

.canvas__list {
  display: grid;
  /* 列表撑满画布剩余高度，落点判定与放置区都覆盖可见白板 */
  flex: 1 1 auto;
  /* 行高按内容，不被剩余高度拉伸（否则字段卡会被撑满整块白板） */
  align-content: start;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  grid-auto-flow: row;
  row-gap: 9px;
  min-height: 120px;
  /* V011-BUG-009：画布字段栅格随中栏全宽（不再限宽 920px 居中） */
  width: 100%;
  margin: 0;
}

.field-shell {
  position: relative;
  /* BF20261013-011：左右空隙加大且相等（16px）；最外圈默认无边框（透明占位保持盒尺寸，选中态仍显主色环） */
  padding: 8px 16px 9px;
  /* BF20261013-012：内容垂直居中——左/右标题位置时不再顶部贴齐、下方留大片空白 */
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: #fff;
  border: 1px solid transparent;
  border-radius: var(--sw-radius-card);
  box-shadow: none;
  cursor: pointer;
  min-width: 0;
  min-height: 80px;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.field-shell--active {
  background: #ffffff;
  border-color: var(--sw-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
}

/* 拖拽预览格：虚线 + 主色描边，内容是真控件渲染结果（松手后即为实际字段） */
.field-shell--pending {
  border-style: dashed;
  border-color: var(--sw-color-primary);
  background: var(--sw-color-primary-light-9, #f7f5ff);
  cursor: copy;
  pointer-events: none;
}

.field-shell__bar {
  /* 设计07：操作条不占布局空间（绝对定位），hover 时仅显示删除动作 */
  display: flex;
  position: absolute;
  /* BF20261013-016：贴壳顶（原 top:4px 时删除图标与控件上缘重叠 4px，观感像被控件压住） */
  top: 0;
  right: 16px;
  left: 16px;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sw-space-8);
  height: 20px;
  /* 悬浮于控件之上：el-select 等控件是 positioned 元素，不抬层会被后绘制的控件盖住 */
  z-index: 3;

  opacity: 0;
  transition: opacity 0.15s;
}

.field-shell:hover .field-shell__bar {
  opacity: 1;
}

.field-shell__del {
  flex: 0 0 auto;
  /* BF20261013-016：白色圆形浮标——即使与控件相邻也清晰可辨 */
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(58, 75, 110, 0.24);
}

/* BF20261013-016：选中字段右缘拖拽调宽手柄（骑在壳边缘上，便于抓取） */
.field-shell__resize {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 28px;
  margin-top: -14px;
  border: 1px solid var(--sw-color-primary);
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(58, 75, 110, 0.18);
  cursor: col-resize;
  z-index: 3;
  touch-action: none;
}

.field-shell__resize::before {
  content: '';
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--sw-color-primary);
}

.field-shell__resize--right {
  right: -4px;
}

.field-shell__table {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-12);
  padding: var(--sw-space-12) var(--sw-space-16);
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
}

.field-shell__control {
  min-width: 0;
  /* BF20261013-011：去掉 -11px 负外边距（原使控件贴左缘造成左右不对称），控件与壳内边距对齐、左右等距 */
  margin: 0;
}

.field-shell__control :deep(.el-form-item__label) {
  margin-left: 0;
}

.field-shell__control :deep(.el-input__inner) {
  line-height: 17px;
}

/* BF20261013-002：移除 text-indent 负缩进 hack——select/picker 类 placeholder 左移被裁切；
   控件恢复 Element Plus 默认内边距后提示完整可见，控件框贴缘由 .field-shell__control 负 margin 承担 */
.field-shell__control :deep(.el-select__wrapper) {
  min-height: 32px;
}

.field-shell__control :deep(.el-textarea__inner) {
  padding-left: 11px;
}

.field-shell__control :deep(.el-date-editor .el-input__prefix) {
  display: none;
}

.field-shell__control :deep(.el-date-editor .el-input__wrapper) {
  padding: 0 11px 0 0;
}

.field-shell__control :deep(.el-date-editor .el-input__wrapper) {
  padding: 0 11px 0 11px;
}

.field-shell.sortable-ghost {
  opacity: 0.45;
  border: 1px dashed var(--sw-color-primary);
  background: var(--sw-color-primary-light-9, var(--sw-fill-base));
}

.field-shell.sortable-chosen {
  border-color: var(--sw-color-primary);
}

.field-shell__table-info {
  display: flex;
  align-items: baseline;
  gap: var(--sw-space-8);
  min-width: 0;
}

.field-shell__table-label {
  font-size: var(--sw-font-body);
  color: var(--sw-text-primary);
}

.field-shell__table-count {
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}

.canvas__empty {
  /* 空态提示浮在放置区中央，不阻挡拖拽落点 */
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  margin: 0;
  text-align: center;
  color: var(--sw-text-placeholder);
  font-size: var(--sw-font-body);
  transform: translateY(-50%);
  pointer-events: none;
}
</style>

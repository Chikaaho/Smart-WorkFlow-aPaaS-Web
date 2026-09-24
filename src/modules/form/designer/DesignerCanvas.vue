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
import { computed, ref, watch } from 'vue'
import type { DesignerItem } from './types'
import type { FormSchema } from '@/contracts/form-schema'
import FormPreview from '@/adapters/form-designer/FormPreview.vue'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import { resolveDropIndex, type DropRect } from './drop-index'
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

// 新一轮拖拽开始时先清空上一轮的落点，预览只在指针真正进入画布后出现。
watch(
  () => props.pendingItem,
  () => {
    dropIndex.value = null
  },
)

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

/** dragover 必须 preventDefault 才允许放置；顺带实时更新落点。 */
function onDragOver(event: DragLikeEvent) {
  if (props.readonly || !props.pendingItem) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  const next = resolveDropIndex(shellRects(), { x: event.clientX, y: event.clientY })
  if (next !== dropIndex.value) dropIndex.value = next
}

/** 指针移出画布（含在子元素间移动）才收起预览。 */
function onDragLeave(event: DragLikeEvent) {
  const root = rootRef.value
  const related = event.relatedTarget
  // relatedTarget 仍落在画布内 = 在子元素间移动，不算离开（contains 形参类型由自身派生，避免命名 DOM 全局）
  if (root && related && root.contains(related as Parameters<typeof root.contains>[0])) return
  dropIndex.value = null
}

/** 放置：按落点交给宿主插入（流式顺序，不做自由定位）。 */
function onDrop(event: DragLikeEvent) {
  const pending = props.pendingItem
  if (props.readonly || !pending) return
  event.preventDefault()
  const at = Math.min(Math.max(dropIndex.value ?? items.value.length, 0), items.value.length)
  dropIndex.value = null
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
      :disabled="readonly"
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
  padding: 8px 11px 9px;
  /* P53 设计（节点07）：字段格白底浅框行式，选中/hover 强化 */
  background: #fff;
  border: 1px solid #e3e9f4;
  border-radius: var(--sw-radius-card);
  box-shadow: none;
  cursor: pointer;
  min-width: 0;
  min-height: 80px;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.field-shell:hover {
  border-color: #dde3ef;
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
  top: 4px;
  right: 11px;
  left: 11px;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sw-space-8);
  height: 24px;

  opacity: 0;
  transition: opacity 0.15s;
}

.field-shell:hover .field-shell__bar {
  opacity: 1;
}

.field-shell__del {
  flex: 0 0 auto;
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
  /* 设计07：控件贴字段格缘（输入文本 pad 12 与设计同位），标签补回缩进 */
  margin: 0 1px 0 -11px;
}

.field-shell__control :deep(.el-form-item__label) {
  margin-left: 11px;
}

.field-shell__control :deep(.el-input__inner) {
  padding: 0;
  text-indent: -12px;
  line-height: 17px;
}

.field-shell__control :deep(.el-select__wrapper) {
  padding-left: 0;
  text-indent: -12px;
}

.field-shell__control :deep(.el-textarea__inner) {
  padding-left: 0;
  text-indent: -11px;
  margin-left: 11px;
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

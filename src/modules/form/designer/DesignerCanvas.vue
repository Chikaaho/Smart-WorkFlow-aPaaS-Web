<script setup lang="ts">
/**
 * 画布（设计器中栏）—— 所见即所得（WYSIWYG）。
 *
 * 每个字段渲染成它的**真控件长相**（经 adapters/FormPreview 的 design 态），外面套一层
 * 「壳」承担全部交互：
 *  - 整块壳是选中热区：点控件任意位置 = 选中该字段（真控件 pointer-events:none，事件穿透到壳）；
 *  - hover 出顶栏：拖拽手柄（.field-shell__handle，仅此处可拖）+ 类型徽标 + 删除按钮；
 *  - 从控件库拖入、画布内拖拽排序，均由壳层接管，真控件不吞事件。
 *
 * 红线：真控件渲染只调 adapters 暴露的 FormPreview（design 态），modules/ 侧画布只管
 * 拖拽/排序/选中/删除的壳，**零 import @form-create/***。
 * 类型徽标读注册表派生（getFieldTypeDescriptor），不写死 8 类。
 */
import { VueDraggable } from 'vue-draggable-plus'
import { Delete, Rank } from '@element-plus/icons-vue'
import { getFieldTypeDescriptor } from './field-types'
import type { DesignerItem } from './types'
import type { FormSchema } from '@/contracts/form-schema'
import FormPreview from '@/adapters/form-designer/FormPreview.vue'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'

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
  }>(),
  { readonly: false, group: 'designer-fields' },
)

const emit = defineEmits<{
  /** 点 TABLE 占位块的「编辑子表」入口：宿主据此打开盖层子画布编辑该子表的子字段。 */
  editTable: [id: string]
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

function typeLabel(item: DesignerItem): string {
  return getFieldTypeDescriptor(item.field.type)?.label ?? item.field.type
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
</script>

<template>
  <section class="canvas">
    <VueDraggable
      v-model="items"
      :group="{ name: group, pull: true, put: true }"
      :animation="150"
      :force-fallback="true"
      :fallback-on-body="true"
      :fallback-tolerance="4"
      item-key="id"
      handle=".field-shell__handle"
      class="canvas__list"
      :disabled="readonly"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="field-shell"
        :class="{ 'field-shell--active': item.id === selectedId }"
        :style="{ gridColumn: `span ${getFormFieldColSpan(item.field)}` }"
        :data-col-span="getFormFieldColSpan(item.field)"
        :data-field-type="item.field.type"
        :data-field-name="item.field.name"
        @click="select(item.id)"
      >
        <div class="field-shell__bar">
          <span class="field-shell__handle" title="拖拽排序">
            <el-icon><Rank /></el-icon>
          </span>
          <span class="field-shell__type">{{ typeLabel(item) }}</span>
          <span class="field-shell__name">{{ item.field.name }}</span>
          <el-button
            v-if="!readonly"
            class="field-shell__del"
            link
            type="danger"
            :icon="Delete"
            title="删除字段"
            @click.stop="remove(item.id)"
          />
        </div>
        <!-- TABLE：占位块 + 「编辑子表」入口（不真渲染内部表格、不发请求）；其余字段走真控件长相。 -->
        <div class="field-shell__control">
          <div v-if="item.field.type === 'TABLE'" class="field-shell__table">
            <div class="field-shell__table-info">
              <span class="field-shell__table-label">{{
                item.field.label || item.field.name
              }}</span>
              <span class="field-shell__table-count">{{ subFieldCount(item) }} 个子字段</span>
            </div>
            <el-button
              class="field-shell__table-edit"
              size="small"
              :disabled="readonly"
              @click.stop="editTable(item.id)"
            >
              编辑子表
            </el-button>
          </div>
          <!-- 真控件长相（design 态 pointer-events:none，整块作为选中热区） -->
          <FormPreview v-else :schema="schemaFor(item)" mode="design" />
        </div>
      </div>
    </VueDraggable>

    <p v-if="items.length === 0" class="canvas__empty">从左侧控件库拖入字段开始设计</p>
  </section>
</template>

<style scoped>
.canvas {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--sw-space-20) var(--sw-space-24);
  background: var(--sw-fill-base);
  overflow-y: auto;
}

.canvas__list {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  grid-auto-flow: row;
  row-gap: var(--sw-space-12);
  min-height: 120px;
  max-width: 920px;
  margin: 0 auto;
}

.field-shell {
  position: relative;
  padding: var(--sw-space-8) var(--sw-space-16) var(--sw-space-12);
  background: #fff;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  cursor: pointer;
  min-width: 0;
  transition: border-color 0.15s;
}

.field-shell:hover {
  border-color: var(--sw-color-primary-light-1, var(--sw-color-primary));
}

.field-shell--active {
  border-color: var(--sw-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-9);
}

.field-shell__bar {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  height: 24px;
  opacity: 0;
  transition: opacity 0.15s;
}

.field-shell:hover .field-shell__bar,
.field-shell--active .field-shell__bar {
  opacity: 1;
}

.field-shell__handle {
  display: inline-flex;
  align-items: center;
  color: var(--sw-text-secondary);
  cursor: grab;
}

.field-shell__handle:active {
  cursor: grabbing;
}

.field-shell__type {
  padding: 0 var(--sw-space-8);
  height: 20px;
  line-height: 20px;
  font-size: var(--sw-font-caption);
  color: var(--sw-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: var(--sw-radius-sm);
}

.field-shell__name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
  font-family: var(--el-font-family-mono, monospace);
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
  margin-top: var(--sw-space-32);
  text-align: center;
  color: var(--sw-text-placeholder);
  font-size: var(--sw-font-body);
}
</style>

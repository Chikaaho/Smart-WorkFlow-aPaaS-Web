<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 控件库（设计器左栏）。
 *
 * 渲染字段类型注册表（FIELD_TYPE_REGISTRY），每条 = 一个可拖拽/可点击添加的控件。
 * 拖入画布时把「描述符」转成「画布项」（DesignerItem），完成默认字段装配与列名生成。
 * **这里禁止写死 8 类**——加类型只动注册表。
 *
 * 拖拽用**原生 HTML5 DnD**（不用 SortableJS）：SortableJS 拖拽只能给定制的 DOM 克隆，
 * 画布无法据此渲染真实组件预览；原生 DnD 下画布按指针位置算插入下标，并在落点直接把
 * 组件渲染出来（所见即所得）。控件库自身永不被改动，只作为拖拽来源。
 */
import { computed, ref, type Component } from 'vue'
import {
  EditPen,
  Edit,
  ArrowDown,
  Select,
  User,
  Document,
  Histogram,
  Calendar,
  Switch,
  List,
  Connection,
  Grid,
  Finished,
  Paperclip,
  Picture,
  InfoFilled,
  Tickets,
  Cpu,
  Monitor,
} from '@element-plus/icons-vue'
import { FIELD_TYPE_REGISTRY, type FieldTypeDescriptor } from './field-types'
import { generateColumnName } from './column-name'
import { nextDesignerItemId, type DesignerItem } from './types'
import type { PaletteDragEvent } from './dnd'
import type { FieldType } from '@/contracts/form-schema'

const props = withDefaults(
  defineProps<{
    /** 画布现有列名，用于克隆时生成唯一列名建议（前端 UX 提示，真校验在后端发布）。 */
    existingNames: string[]
    /** 已发布表单：禁止从控件库拖入新字段。 */
    disabled?: boolean
    /**
     * 允许的字段类型白名单；只露其中的控件。缺省=全注册表（主画布八类）。
     * 盖层子画布传六种通用字段，硬挡 REFERENCE/TABLE 进子表。
     */
    allowedTypes?: readonly FieldType[]
  }>(),
  { disabled: false, allowedTypes: undefined },
)

/** 按 allowedTypes 过滤后的控件列表（缺省=全量）。model-value 与 v-for 同源，保证克隆按序对齐。 */
const palette = computed<readonly FieldTypeDescriptor[]>(() =>
  props.allowedTypes
    ? FIELD_TYPE_REGISTRY.filter((d) => props.allowedTypes!.includes(d.type))
    : FIELD_TYPE_REGISTRY,
)

type PaletteEntry = {
  type: string
  label: string
  icon: string
  descriptor?: FieldTypeDescriptor
  disabled?: boolean
}

const LABELS: Record<string, string> = {
  TEXT: 'form.paletteSingleLine',
  RICH_TEXT: 'form.paletteMultiLine',
  NUMBER: 'form.paletteNumberInput',
  DICT: 'form.paletteDropdown',
  BOOL: 'form.paletteRadio',
  MULTISELECT: 'form.paletteCheckbox',
  DATE: 'form.paletteDateTime',
  ATTACHMENT: 'form.paletteUpload',
  LABEL: 'form.paletteText',
  USER: 'form.palettePerson',
  DEPT: 'form.paletteDepartment',
  SERIAL: 'form.paletteSerial',
  DATASOURCE: 'form.paletteRelatedData',
  GRID: 'form.paletteGrid',
  GROUP: 'form.paletteGroupPanel',
  DIVIDER: 'form.paletteDivider',
  SUBTABLE: 'form.paletteSubTable',
  FORMULA: 'form.paletteFormula',
  IOT: 'form.paletteIot',
  AGENT: 'form.paletteAgent',
}

const ENTRY_ICONS: Record<string, string> = {
  TEXT: 'TextGlyph',
  RICH_TEXT: 'TextGlyph',
  NUMBER: 'HashGlyph',
  DICT: 'ArrowDown',
  BOOL: 'Select',
  MULTISELECT: 'Select',
  DATE: 'Calendar',
  ATTACHMENT: 'Paperclip',
  LABEL: 'TextGlyph',
  USER: 'User',
  DEPT: 'Grid',
  SERIAL: 'HashGlyph',
  DATASOURCE: 'Document',
  GRID: 'Grid',
  GROUP: 'Grid',
  DIVIDER: 'Tickets',
  SUBTABLE: 'Grid',
  FORMULA: 'HashGlyph',
  IOT: 'Cpu',
  AGENT: 'Monitor',
}

/** P53 设计（节点07）：组件库四组布局。
 * 可用入口由 FIELD_TYPE_REGISTRY 提供；设计中已锁定但当前契约未启用的入口以 disabled
 * 形式保留位置，既不伪造能力，也不让拖拽通道产生未定义字段。
 */
const paletteSearch = ref('')
const PALETTE_GROUPS: Array<{ key: string; types: string[] }> = [
  {
    key: 'form.paletteGroupBasic',
    types: [
      'TEXT',
      'RICH_TEXT',
      'NUMBER',
      'DICT',
      'BOOL',
      'MULTISELECT',
      'DATE',
      'ATTACHMENT',
      'LABEL',
    ],
  },
  { key: 'form.paletteGroupBusiness', types: ['USER', 'DEPT', 'SERIAL', 'DATASOURCE'] },
  { key: 'form.paletteGroupLayout', types: ['GRID', 'GROUP', 'DIVIDER', 'SUBTABLE'] },
  { key: 'form.paletteGroupAdvanced', types: ['FORMULA', 'RICH_TEXT', 'IOT', 'AGENT'] },
]

const descriptorByType = computed(() => new Map(palette.value.map((d) => [d.type, d])))

const paletteGrouped = computed(() => {
  const keyword = paletteSearch.value.trim().toLowerCase()
  const unavailable = new Set(['SERIAL', 'GRID', 'GROUP', 'DIVIDER', 'SUBTABLE', 'IOT', 'AGENT'])
  const entries = (type: string, groupKey: string): PaletteEntry | null => {
    const descriptor = descriptorByType.value.get(type as FieldType)
    if (props.allowedTypes && (!descriptor || !props.allowedTypes.includes(descriptor.type)))
      return null
    const labelKey =
      groupKey === 'form.paletteGroupAdvanced' && type === 'RICH_TEXT'
        ? 'form.fieldTypeRichText'
        : (LABELS[type] ?? type)
    const label = t(labelKey)
    if (keyword && !label.toLowerCase().includes(keyword) && !type.toLowerCase().includes(keyword))
      return null
    return {
      type,
      label,
      icon: ENTRY_ICONS[type] ?? 'InfoFilled',
      descriptor,
      disabled: unavailable.has(type),
    }
  }
  return PALETTE_GROUPS.map((group) => ({
    key: group.key,
    items: group.types
      .map((type) => entries(type, group.key))
      .filter((entry): entry is PaletteEntry => entry !== null),
  })).filter((group) => group.items.length > 0)
})

const emit = defineEmits<{
  /** 键盘/点击添加时，把与拖入相同的默认画布项交给宿主。 */
  add: [item: DesignerItem]
  /** 原生拖拽开始：宿主据此让画布渲染落点预览（同一 createItem 产物）。 */
  'drag-start': [item: DesignerItem]
  /** 原生拖拽结束（含取消）：宿主据此清空预览。 */
  'drag-end': []
}>()

/** 图标白名单（本地解析，注册表只存字符串键，不直引图标组件）。 */
const ICON_MAP: Record<string, Component> = {
  Edit,
  ArrowDown,
  Select,
  User,
  EditPen,
  Document,
  Histogram,
  Calendar,
  Switch,
  List,
  Connection,
  Grid,
  Finished,
  Paperclip,
  Picture,
  InfoFilled,
  Tickets,
  Cpu,
  Monitor,
}

const GLYPH_MAP: Record<string, string> = {
  TextGlyph: 'T',
  HashGlyph: '#',
}

function createItem(descriptor: FieldTypeDescriptor): DesignerItem {
  const name = generateColumnName(
    descriptor.label,
    props.existingNames,
    props.existingNames.length + 1,
  )
  return { id: nextDesignerItemId(), field: descriptor.createDefault(name) }
}

/** 保留拖拽入口，同时提供可访问的点击添加入口，二者使用同一默认装配逻辑。 */
function addFromPalette(entry: PaletteEntry) {
  if (props.disabled || entry.disabled || !entry.descriptor) return
  emit('add', createItem(entry.descriptor))
}

/**
 * 拖拽开始：把「将要插入的画布项」交给宿主 → 宿主转交画布做落点预览。
 * 预览项与点击添加/最终落库使用同一 createItem，保证「预览 = 落库结果」。
 * 不可用条目一律阻止拖拽，不产生任何悬空状态。
 */
function onDragStart(event: PaletteDragEvent, entry: PaletteEntry) {
  if (props.disabled || entry.disabled || !entry.descriptor) {
    event.preventDefault()
    return
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    // 仅用于宿主/浏览器识别，画布不依赖它读取字段类型（dragover 阶段数据是受保护的）。
    event.dataTransfer.setData('text/plain', entry.type)
  }
  emit('drag-start', createItem(entry.descriptor))
}

/** 拖拽结束（含取消）：通知宿主清掉落点预览。 */
function onDragEnd() {
  emit('drag-end')
}
</script>

<template>
  <aside class="palette" :class="{ 'palette--disabled': disabled }">
    <h2 class="palette__title">{{ t('form.controlPalette') }}</h2>
    <div class="palette__search">
      <input
        v-model="paletteSearch"
        type="text"
        class="palette__search-input"
        :placeholder="t('form.paletteSearch')"
        :aria-label="t('form.paletteSearch')"
      />
    </div>
    <p v-if="paletteGrouped.length === 0" class="palette__empty">{{ t('form.paletteNoMatch') }}</p>
    <section v-for="group in paletteGrouped" :key="group.key" class="palette-group">
      <h3 class="palette-group__title">{{ t(group.key) }}</h3>
      <div class="palette__list">
        <button
          v-for="d in group.items"
          :key="d.type"
          type="button"
          class="palette__item"
          :data-field-type="d.type"
          :disabled="d.disabled || disabled"
          :draggable="!d.disabled && !disabled"
          @dragstart="onDragStart($event, d)"
          @dragend="onDragEnd"
          @click="addFromPalette(d)"
        >
          <span v-if="GLYPH_MAP[d.icon]" class="palette__icon palette__glyph">{{
            GLYPH_MAP[d.icon]
          }}</span>
          <el-icon v-else-if="ICON_MAP[d.icon]" class="palette__icon">
            <component :is="ICON_MAP[d.icon]" />
          </el-icon>
          <span class="palette__label">{{ d.label }}</span>
        </button>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.palette {
  width: 200px;
  flex: 0 0 200px;
  border-right: 1px solid var(--sw-border-light);
  padding: var(--sw-space-16);
  overflow-y: auto;
}

.palette__title {
  margin: 0 0 var(--sw-space-12);
  font-size: var(--sw-font-h2);
  font-weight: var(--sw-font-weight-h2);
  color: var(--sw-text-primary);
}

.palette__search {
  margin-bottom: var(--sw-space-12);
}
.palette__search-input {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #cbd5e7;
  border-radius: 6px;
  background: #fbfcff;
  font-size: 13px;
  color: var(--sw-text-primary);
  outline: none;
}
.palette__search-input::placeholder {
  color: #99a5bb;
}
.palette__empty {
  margin: 8px 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.palette-group {
  margin-bottom: 42px;
}
.palette-group__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-text-primary);
  transform: translateY(-11px);
}
.palette__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.palette__item {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  height: 38px;
  padding: 0 10px;
  border: 1px solid #cbd5e7;
  border-radius: var(--sw-radius-base);
  background: #fff;
  color: #19233b;
  font-size: var(--sw-font-body);
  text-align: left;
  cursor: grab;
  user-select: none;
}

.palette__item:active {
  cursor: grabbing;
}

.palette__item:hover {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}
.palette__label {
  color: #19233b;
}

.palette__icon {
  color: var(--sw-text-secondary);
}
.palette__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-family: Arial, sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 18px;
}

.palette__item:hover .palette__icon {
  color: var(--sw-color-primary);
}

.palette--disabled .palette__item {
  cursor: not-allowed;
  opacity: 0.5;
}

.palette--disabled .palette__item:hover {
  border-color: var(--sw-border-base);
  color: var(--sw-text-regular);
}

.palette--disabled .palette__item:hover .palette__icon {
  color: var(--sw-text-secondary);
}
</style>

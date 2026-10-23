<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 控件库（设计器左栏）。
 *
 * 渲染字段类型注册表（FIELD_TYPE_REGISTRY），每条 = 一个可拖拽/可点击添加的控件。
 * 拖入画布时把「描述符」转成「画布项」（DesignerItem），完成默认字段装配与列名生成。
 * 字段装配只走注册表，分组与展示入口在本组件声明。
 *
 * 拖拽用**原生 HTML5 DnD**（不用 SortableJS）：SortableJS 拖拽只能给定制的 DOM 克隆，
 * 画布无法据此渲染真实组件预览；原生 DnD 下画布按指针位置算插入下标，并在落点直接把
 * 组件渲染出来（所见即所得）。控件库自身永不被改动，只作为拖拽来源。
 */
import { computed, ref } from 'vue'
import editIcon from '@/assets/form-palette/edit.svg'
import documentIcon from '@/assets/form-palette/document.svg'
import gridIcon from '@/assets/form-palette/grid.svg'
import arrowDownIcon from '@/assets/form-palette/arrow-down.svg'
import checkIcon from '@/assets/form-palette/check.svg'
import calendarIcon from '@/assets/form-palette/calendar.svg'
import clockIcon from '@/assets/form-palette/clock.svg'
import settingIcon from '@/assets/form-palette/setting.svg'
import uploadIcon from '@/assets/form-palette/upload.svg'
import viewIcon from '@/assets/form-palette/view.svg'
import userIcon from '@/assets/form-palette/user.svg'
import folderIcon from '@/assets/form-palette/folder.svg'
import connectionIcon from '@/assets/form-palette/connection.svg'
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
  /** 唯一键（同类型多变体时 `type#variant`）。 */
  key: string
  type: string
  /** BF20261013-009：DICT 双入口变体（下拉选择 / 单选框），其余类型无变体。 */
  variant?: 'dropdown' | 'radio'
  label: string
  icon: string
  descriptor?: FieldTypeDescriptor
  disabled?: boolean
}

/** 控件库条目引用：字符串=注册表原样；对象=DICT 的显示变体（同类型双入口）。 */
type PaletteTypeRef = string | { type: string; variant: 'dropdown' | 'radio' }

/**
 * BF20261013-010：库内名称一律取注册表 descriptor.label（单一名称源）——
 * 拖出后的默认字段名与库内显示名天然一致，杜绝两套名称漂移。
 * 未进入字段注册表的展示入口单独声明，不生成字段。
 */
const PLACEHOLDER_LABELS: Record<string, string> = { RICH_EDITOR: 'form.paletteRichText' }

const PALETTE_ICONS: Record<string, string> = {
  TEXT: editIcon,
  RICH_TEXT: documentIcon,
  NUMBER: gridIcon,
  DICT: arrowDownIcon,
  'DICT#radio': checkIcon,
  BOOL: settingIcon,
  MULTISELECT: checkIcon,
  DATE: calendarIcon,
  TIME: clockIcon,
  ATTACHMENT: uploadIcon,
  IMAGE: viewIcon,
  LABEL: documentIcon,
  USER: userIcon,
  DEPT: folderIcon,
  REFERENCE: connectionIcon,
  TABLE: gridIcon,
  RICH_EDITOR: documentIcon,
  FORMULA: gridIcon,
  DATASOURCE: connectionIcon,
}

/** P53 设计（节点07）：组件库基础、业务、高级三组布局。
 * 可用入口由 FIELD_TYPE_REGISTRY 提供；当前契约未启用的展示入口以 disabled
 * 形式保留位置，既不伪造能力，也不让拖拽通道产生未定义字段。
 */
const paletteSearch = ref('')
const PALETTE_GROUPS: Array<{ key: string; types: PaletteTypeRef[] }> = [
  {
    key: 'form.paletteGroupBasic',
    types: [
      'TEXT',
      'RICH_TEXT',
      'NUMBER',
      { type: 'DICT', variant: 'dropdown' },
      { type: 'DICT', variant: 'radio' },
      'MULTISELECT',
      'DATE',
      'TIME',
      'BOOL',
      'ATTACHMENT',
      'IMAGE',
      'LABEL',
    ],
  },
  { key: 'form.paletteGroupBusiness', types: ['USER', 'DEPT', 'REFERENCE', 'TABLE'] },
  { key: 'form.paletteGroupAdvanced', types: ['RICH_EDITOR', 'FORMULA', 'DATASOURCE'] },
]

const descriptorByType = computed(() => new Map(palette.value.map((d) => [d.type, d])))

const paletteGrouped = computed(() => {
  const keyword = paletteSearch.value.trim().toLowerCase()
  // RICH_EDITOR是设计展示入口，未注册描述符，不生成字段。
  const unavailable = new Set(['RICH_EDITOR'])
  const entries = (ref: PaletteTypeRef, _groupKey: string): PaletteEntry | null => {
    const type = typeof ref === 'string' ? ref : ref.type
    const variant = typeof ref === 'string' ? undefined : ref.variant
    const descriptor = descriptorByType.value.get(type as FieldType)
    if (props.allowedTypes && (!descriptor || !props.allowedTypes.includes(descriptor.type)))
      return null
    // BF20261013-010：注册表内类型一律 descriptor.label；单选框变体用入口名；占位条目查映射
    const label =
      variant === 'radio'
        ? t('form.paletteRadio')
        : (descriptor?.label ?? t(PLACEHOLDER_LABELS[type] ?? type))
    const entryKey = variant ? `${type}#${variant}` : type
    if (
      keyword &&
      !label.toLowerCase().includes(keyword) &&
      !entryKey.toLowerCase().includes(keyword)
    )
      return null
    return {
      key: entryKey,
      type,
      variant,
      label,
      icon: PALETTE_ICONS[entryKey] ?? PALETTE_ICONS[type] ?? '',
      descriptor,
      disabled: unavailable.has(type),
    }
  }
  return PALETTE_GROUPS.map((group) => ({
    key: group.key,
    items: group.types
      .map((ref) => entries(ref, group.key))
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

function createItem(entry: PaletteEntry): DesignerItem {
  const descriptor = entry.descriptor!
  const name = generateColumnName(entry.label, props.existingNames, props.existingNames.length + 1)
  const field = descriptor.createDefault(name)
  // BF20261013-009：DICT 单选框变体——数据来源/显示方式在配置面板继续可调
  if (entry.variant === 'radio' && field.type === 'DICT') {
    field.renderAs = 'radio'
    field.label = entry.label
  }
  return { id: nextDesignerItemId(), field }
}

/** 保留拖拽入口，同时提供可访问的点击添加入口，二者使用同一默认装配逻辑。 */
function addFromPalette(entry: PaletteEntry) {
  if (props.disabled || entry.disabled || !entry.descriptor) return
  emit('add', createItem(entry))
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
  emit('drag-start', createItem(entry))
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
          :key="d.key"
          type="button"
          class="palette__item"
          :data-field-type="d.type"
          :data-field-variant="d.variant"
          :disabled="d.disabled || disabled"
          :title="d.disabled ? t('form.componentUnavailable') : undefined"
          :draggable="!d.disabled && !disabled"
          @dragstart="onDragStart($event, d)"
          @dragend="onDragEnd"
          @click="addFromPalette(d)"
        >
          <span
            v-if="d.icon"
            class="palette__icon"
            :style="{ maskImage: `url(&quot;${d.icon}&quot;)` }"
            aria-hidden="true"
          />
          <span class="palette__label">{{ d.label }}</span>
        </button>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.palette {
  box-sizing: border-box;
  width: 252px;
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--sw-space-16);
  overflow-y: auto;
  background: var(--sw-bg-white, #fff);
}
.palette__title {
  margin: 0 0 var(--sw-space-12);
  font-size: var(--sw-font-h2);
  line-height: 24px;
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-primary);
}
.palette__search {
  margin-bottom: var(--sw-space-12);
}
.palette__search-input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-bg-white, #fff);
  font: inherit;
  font-size: var(--sw-font-body);
  line-height: 22px;
  color: var(--sw-text-primary);
}
.palette__search-input::placeholder {
  color: var(--sw-text-placeholder);
}
.palette__search-input:focus-visible {
  outline: 2px solid var(--sw-color-primary);
  outline-offset: 1px;
}
.palette__empty {
  margin: 8px 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.palette-group {
  margin-bottom: var(--sw-space-12);
}
.palette-group__title {
  margin: 0 0 var(--sw-space-12);
  font-size: var(--sw-font-caption);
  line-height: 18px;
  font-weight: var(--sw-font-weight-body);
  color: var(--sw-text-secondary);
}
.palette__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 8px;
}
.palette__item {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-bg-white, #fff);
  color: var(--sw-text-regular);
  font: inherit;
  font-size: var(--sw-font-caption);
  line-height: 18px;
  text-align: left;
  cursor: grab;
  user-select: none;
}
.palette__item:active {
  cursor: grabbing;
}
.palette__item:hover:not(:disabled) {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}
.palette__label {
  color: inherit;
}
.palette__icon {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  color: var(--sw-text-secondary);
  background-color: currentColor;
  mask-size: contain;
  mask-position: center;
  mask-repeat: no-repeat;
}
.palette__item:hover:not(:disabled) .palette__icon {
  color: var(--sw-color-primary);
}
.palette__item:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>

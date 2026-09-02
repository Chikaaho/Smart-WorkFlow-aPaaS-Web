<script setup lang="ts">
/**
 * 控件库（设计器左栏）。
 *
 * 渲染字段类型注册表（FIELD_TYPE_REGISTRY），每条 = 一个可拖拽/可点击添加的控件。
 * 拖入画布时经 :clone 把「描述符」转成「画布项」（DesignerItem），完成默认字段装配
 * 与列名生成。**这里禁止写死 8 类**——加类型只动注册表。
 *
 * 与画布共享 SortableJS group 'designer-fields'，pull:'clone' + put:false + sort:false：
 * 控件库本身永不被改动，只作为克隆来源。
 */
import { computed, type Component } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import {
  EditPen,
  Document,
  Histogram,
  Calendar,
  Switch,
  List,
  Connection,
  Grid,
} from '@element-plus/icons-vue'
import { FIELD_TYPE_REGISTRY, type FieldTypeDescriptor } from './field-types'
import { generateColumnName } from './column-name'
import { nextDesignerItemId, type DesignerItem } from './types'
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
    /**
     * SortableJS group 名。缺省 'designer-fields'（主画布上下文）。
     * 盖层子画布传独立 group（如 'designer-subfields'），与主画布拖放严格隔离、互不串。
     */
    group?: string
  }>(),
  { disabled: false, allowedTypes: undefined, group: 'designer-fields' },
)

/** 按 allowedTypes 过滤后的控件列表（缺省=全量）。model-value 与 v-for 同源，保证克隆按序对齐。 */
const palette = computed<readonly FieldTypeDescriptor[]>(() =>
  props.allowedTypes
    ? FIELD_TYPE_REGISTRY.filter((d) => props.allowedTypes!.includes(d.type))
    : FIELD_TYPE_REGISTRY,
)

const emit = defineEmits<{
  /** 键盘/点击添加时，把与拖入相同的默认画布项交给宿主。 */
  add: [item: DesignerItem]
}>()

/** 图标白名单（本地解析，注册表只存字符串键，不直引图标组件）。 */
const ICON_MAP: Record<string, Component> = {
  EditPen,
  Document,
  Histogram,
  Calendar,
  Switch,
  List,
  Connection,
  Grid,
}

/**
 * 克隆钩子：描述符 → 画布项。
 * SortableJS 在 pull:'clone' 时调用，返回值即插入画布 v-model 的对象。
 */
function cloneToItem(descriptor: FieldTypeDescriptor): DesignerItem {
  return createItem(descriptor)
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
function addFromPalette(descriptor: FieldTypeDescriptor) {
  if (props.disabled) return
  emit('add', createItem(descriptor))
}
</script>

<template>
  <aside class="palette" :class="{ 'palette--disabled': disabled }">
    <h2 class="palette__title">控件库</h2>
    <VueDraggable
      :model-value="[...palette]"
      :group="{ name: group, pull: 'clone', put: false }"
      :sort="false"
      :clone="cloneToItem"
      :animation="150"
      :force-fallback="true"
      :fallback-on-body="true"
      :fallback-tolerance="4"
      item-key="type"
      class="palette__list"
      :disabled="disabled"
    >
      <button
        v-for="d in palette"
        :key="d.type"
        type="button"
        class="palette__item"
        :data-field-type="d.type"
        @click="addFromPalette(d)"
      >
        <el-icon v-if="ICON_MAP[d.icon]" class="palette__icon">
          <component :is="ICON_MAP[d.icon]" />
        </el-icon>
        <span class="palette__label">{{ d.label }}</span>
      </button>
    </VueDraggable>
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

.palette__list {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-8);
}

.palette__item {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  height: var(--sw-control-height);
  padding: 0 var(--sw-space-12);
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  background: #fff;
  color: var(--sw-text-regular);
  font-size: var(--sw-font-body);
  cursor: grab;
  user-select: none;
}

.palette__item:hover {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}

.palette__icon {
  color: var(--sw-text-secondary);
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

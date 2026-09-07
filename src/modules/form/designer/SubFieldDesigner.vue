<script setup lang="ts">
/**
 * 子表盖层子画布 —— 编辑子表字段的内部字段。
 *
 * 盖满设计区、盖在主画布之上（主画布在底下、本盖层独占交互）。复用主画布那整套机制
 * （控件库 / 画布 / 六类配置面板 / 列名校验 / 字段类型注册表），但作用在「这个子表的
 * 内部字段」这个**独立上下文**：
 *  - 状态独立：子画布的 items / 选中项与主画布严格隔离（本组件 v-if 挂载，每次打开从
 *    subFields 重新播种；主画布的 items / selectedId 引用不被触碰）。
 *  - 控件库只露六种通用字段（ALLOWED_SUBFIELD_TYPES），硬挡 REFERENCE / TABLE 进子表
 *    （防递归，对齐后端 1207）。
 *  - 列名查重范围 = **当前子表内部的子字段们**（独立物理子表，列名空间与主表、与别的
 *    子表隔离）；existing-names / other-names 全取自子画布 items，不掺主表字段。
 *  - 拖放 group 用独立名 'designer-subfields'，与主画布 'designer-fields' 互不串。
 *
 * 返回时把子画布 items 转回 TableSubField[] 抛给宿主写回该子表字段的 subFields。
 */
import { ref, computed } from 'vue'
import { ArrowLeft } from '@element-plus/icons-vue'
import FieldPalette from './FieldPalette.vue'
import DesignerCanvas from './DesignerCanvas.vue'
import FieldConfigPanel from './FieldConfigPanel.vue'
import { applyFieldPatch, type FieldPatch } from './field-config'
import { subFieldsToItems, itemsToSubFields, ALLOWED_SUBFIELD_TYPES } from './subfield-convert'
import type { DesignerItem } from './types'
import type { TableSubField } from '@/contracts/form-schema'

const props = withDefaults(
  defineProps<{
    /** 正在编辑的子表标签（盖层标题展示）。 */
    tableLabel: string
    /** 子表当前子字段，作为盖层初始播种数据源。 */
    subFields: readonly TableSubField[]
    /** 已发布表单：子画布全程只读（拖入/排序/删除/配置全禁）。 */
    readonly?: boolean
  }>(),
  { readonly: false },
)

const emit = defineEmits<{
  /** 返回主画布；携带最新子字段供宿主写回该子表字段的 subFields。 */
  close: [subFields: TableSubField[]]
}>()

/* ── 独立子画布状态（与主画布互不串；组件 v-if 挂载，每次打开 setup 重跑即重新播种） ── */
const subItems = ref<DesignerItem[]>(subFieldsToItems(props.subFields))
const subSelectedId = ref<string | null>(null)

/* 列名查重范围严格限子表内部：取自子画布 items，不掺主表。 */
const existingNames = computed(() => subItems.value.map((it) => it.field.name))
const selectedItem = computed(
  () => subItems.value.find((it) => it.id === subSelectedId.value) ?? null,
)
const otherNames = computed(() =>
  subItems.value.filter((it) => it.id !== subSelectedId.value).map((it) => it.field.name),
)

/** 子画布控件库点击添加：与主画布共享默认字段形态，但状态只写入子表上下文。 */
function addPaletteItem(item: DesignerItem) {
  if (props.readonly) return
  subItems.value.push(item)
  subSelectedId.value = item.id
}

/** 配置面板回写：就地把补丁合并进选中子字段（单一数据源，复用主画布同一条路径）。 */
function patchSelected(patch: FieldPatch) {
  const item = subItems.value.find((it) => it.id === subSelectedId.value)
  if (item) applyFieldPatch(item.field, patch)
}

/** 返回主画布：把子画布 items 转回 subFields 抛给宿主写回。 */
function back() {
  emit('close', itemsToSubFields(subItems.value))
}
</script>

<template>
  <div class="sub-designer">
    <header class="sub-designer__header">
      <el-button class="sub-designer__back" :icon="ArrowLeft" link @click="back">返回</el-button>
      <span class="sub-designer__title">子表字段编辑 · {{ tableLabel }}</span>
    </header>

    <div class="sub-designer__body">
      <FieldPalette
        :existing-names="existingNames"
        :allowed-types="ALLOWED_SUBFIELD_TYPES"
        group="designer-subfields"
        :disabled="readonly"
        @add="addPaletteItem"
      />
      <DesignerCanvas
        v-model:items="subItems"
        v-model:selected-id="subSelectedId"
        group="designer-subfields"
        :readonly="readonly"
      />
      <FieldConfigPanel
        :field="selectedItem"
        :other-names="otherNames"
        :readonly="readonly"
        @update="patchSelected"
      />
    </div>
  </div>
</template>

<style scoped>
.sub-designer {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.sub-designer__header {
  display: flex;
  align-items: center;
  gap: var(--sw-space-12);
  padding: var(--sw-space-12) var(--sw-space-24);
  border-bottom: 1px solid var(--sw-border-light);
}

.sub-designer__title {
  font-size: var(--sw-font-h2);
  font-weight: var(--sw-font-weight-h2);
  color: var(--sw-text-primary);
}

.sub-designer__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}
</style>

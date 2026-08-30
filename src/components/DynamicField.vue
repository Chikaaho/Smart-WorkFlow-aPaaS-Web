<script setup lang="ts">
/**
 * DynamicField — 低代码字段渲染原子。
 * 按 field.type 查 DYNAMIC_FIELD_REGISTRY（dynamic-field-registry.ts）渲染对应控件，
 * 无 per-type if/switch 链；8 类控件各自为独立组件（dynamic-field-controls/），
 * TABLE 子表单元格查同一注册表（REFERENCE 降级占位 / TABLE 不递归）。
 * 数据外部进（modelValue），更新通过 emit 出——零 onMounted 拉数据。
 */
import { computed } from 'vue'
import type { FormSchemaField } from '@/contracts/form-schema'
import { getDynamicFieldDescriptor } from './dynamic-field-registry'

const props = withDefaults(
  defineProps<{
    field: FormSchemaField
    modelValue: unknown
    /**
     * 只读模式（语义随控件类型，见各控件实现）：
     * - TEXT / RICH_TEXT → readonly
     * - NUMBER / DATE / BOOL / DICT → disabled
     * - REFERENCE → 只读输入框，禁用「选择」按钮
     * - TABLE → 隐藏添加/删除按钮，子控件 disabled
     */
    readonly?: boolean
    /**
     * REFERENCE 字段回显标签（显示名）。
     * 记录加载时由父页面 resolveReferenceDisplay 解析后传入，
     * 覆盖内置的 referenceDisplayValue。
     * 只影响「显示」，底层 v-model 仍为 id。
     */
    referenceLabel?: string
  }>(),
  {
    readonly: false,
    referenceLabel: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

/** 主渲染控件：查注册表动态挂载（未注册类型 → 不渲染，消费方兜底）。 */
const controlComponent = computed(
  () => getDynamicFieldDescriptor(props.field.type)?.component ?? null,
)

/** 动态挂载控件的事件负载无静态类型（<component :is>），显式声明为 unknown。 */
function onControlUpdate(value: unknown) {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="dynamic-field">
    <!-- 标签 + 必填红星（页型A 规范） -->
    <label class="dynamic-field__label">
      <span v-if="field.required" class="dynamic-field__required">*</span>
      {{ field.label ?? field.name }}
    </label>

    <component
      :is="controlComponent"
      v-if="controlComponent"
      :field="field"
      :model-value="modelValue"
      :readonly="readonly"
      :reference-label="referenceLabel"
      @update:model-value="onControlUpdate"
    />
  </div>
</template>

<style scoped>
/* ── 所有视觉值仅引用 --sw-* token，零硬编码 px/hex ── */

.dynamic-field {
  width: 100%;
}

.dynamic-field__label {
  display: block;
  margin-bottom: var(--sw-space-8);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-primary);
}

.dynamic-field__required {
  color: var(--sw-danger);
  margin-right: var(--sw-space-4);
}

/* 控件高度统一（:deep 穿透到注册表挂载的子控件） */
.dynamic-field :deep(.el-input__wrapper),
.dynamic-field :deep(.el-input-number__wrapper),
.dynamic-field :deep(.el-select__wrapper) {
  min-height: var(--sw-control-height);
}

/* focus 态：边框主色 + 光晕（页型A 规范） */
.dynamic-field :deep(.el-input.is-focus .el-input__wrapper),
.dynamic-field :deep(.el-input-number.is-focus .el-input-number__wrapper),
.dynamic-field :deep(.el-select.is-focus .el-select__wrapper),
.dynamic-field :deep(.el-date-editor.is-focus .el-input__wrapper) {
  box-shadow: 0 0 0 2px var(--sw-color-primary); /* focus 光晕 fallback */
}

/* 圆角 */
.dynamic-field :deep(.el-input__wrapper),
.dynamic-field :deep(.el-input-number__wrapper),
.dynamic-field :deep(.el-select__wrapper),
.dynamic-field :deep(.el-button) {
  border-radius: var(--sw-radius-base);
}
</style>

<script setup lang="ts">
/**
 * 多选（MULTISELECT）控件：候选选项来自字段定义 options（键值对，兼容历史 string[]）；
 * BF20261013-009：数据来源 source=dict 时改用绑定字典项（dictType）。
 * BF20261013-010：数据源未配置时渲染禁用占位提示「请配置数据」。
 * 展示 value/label、提交 key/code；空键行（编辑中间态）不渲染。
 * 主渲染与子表单元格共用（subField=true → size=small）。
 */
import { computed } from 'vue'
import { useI18n } from '@/locales'
import { parseFormFieldOptions, type MultiSelectField } from '@/contracts/form-schema'
import { useDict } from '@/foundation/dict'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

const { t } = useI18n()

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const field = computed(() =>
  props.field.type === 'MULTISELECT' ? (props.field as MultiSelectField) : null,
)

const { items: dictItems } = useDict(
  field.value?.source === 'dict' ? (field.value.dictType ?? '') : '',
)

/** 统一选项形态：key=提交值（自定义键/字典 code）、label=展示名。 */
interface NamedOption {
  key: string
  label: string
}

const options = computed<NamedOption[]>(() => {
  if (field.value?.source === 'dict') {
    return dictItems.value.map((i) => ({ key: String(i.value), label: i.label }))
  }
  return parseFormFieldOptions(field.value?.options)
    .filter((o) => o.key !== '')
    .map((o) => ({ key: o.key, label: o.value || o.key }))
})

/** 数据源是否已配置（未配置 → 禁用占位提示）。 */
const configured = computed(() =>
  field.value?.source === 'dict' ? !!field.value.dictType?.trim() : options.value.length > 0,
)

const value = computed<string[]>(() =>
  Array.isArray(props.modelValue) ? (props.modelValue as string[]) : [],
)

const selectedKeys = computed(() => new Set(value.value))

function onChange(next: unknown) {
  emit('update:modelValue', Array.isArray(next) ? next : [])
}
</script>

<template>
  <!-- BF20261013-010：未配置数据源 → 禁用占位提示 -->
  <el-select
    v-if="!configured && !readonly"
    :size="subField ? 'small' : undefined"
    disabled
    :placeholder="t('form.configureDataPrompt')"
  />

  <!-- 只读回看：按设计器同一套选择项呈现（选中打勾），不渲染输入框 -->
  <div v-else-if="readonly" class="readonly-options">
    <span
      v-for="opt in options"
      :key="opt.key"
      class="readonly-option"
      :class="{ 'is-selected': selectedKeys.has(opt.key) }"
    >
      <span class="readonly-option__mark">{{ selectedKeys.has(opt.key) ? '✓' : '' }}</span>
      {{ opt.label }}
    </span>
    <span v-if="options.length === 0" class="readonly-options__empty">未选择</span>
  </div>

  <el-select
    v-else
    :size="subField ? 'small' : undefined"
    multiple
    :model-value="value"
    clearable
    @update:model-value="onChange"
  >
    <el-option v-for="opt in options" :key="opt.key" :label="opt.label" :value="opt.key" />
  </el-select>
</template>

<style scoped>
.readonly-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 6px 0;
}
.readonly-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--sw-text-secondary);
  line-height: 22px;
}
.readonly-option__mark {
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  border: 1px solid var(--sw-border-base);
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
  line-height: 14px;
  text-align: center;
}
.readonly-option.is-selected {
  color: #5b4bdb;
  font-weight: 500;
}
.readonly-option.is-selected .readonly-option__mark {
  border-color: #5b4bdb;
  background: #5b4bdb;
}
.readonly-options__empty {
  color: var(--sw-text-secondary);
  line-height: 22px;
}
</style>

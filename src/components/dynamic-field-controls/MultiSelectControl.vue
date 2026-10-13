<script setup lang="ts">
/**
 * 多选（MULTISELECT）控件：候选选项来自字段定义 options（键值对，兼容历史 string[]）；
 * BF20261013-009：数据来源 source=dict 时改用绑定字典项（dictType）。
 * 展示 value/label、提交 key/code；空键行（编辑中间态）不渲染。
 * 主渲染与子表单元格共用（subField=true → size=small）。
 */
import { computed } from 'vue'
import { parseFormFieldOptions, type MultiSelectField } from '@/contracts/form-schema'
import { useDict } from '@/foundation/dict'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

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

const value = computed<string[]>(() =>
  Array.isArray(props.modelValue) ? (props.modelValue as string[]) : [],
)

function onChange(next: unknown) {
  emit('update:modelValue', Array.isArray(next) ? next : [])
}
</script>

<template>
  <el-select
    :size="subField ? 'small' : undefined"
    multiple
    :model-value="value"
    :disabled="readonly"
    clearable
    @update:model-value="onChange"
  >
    <el-option v-for="opt in options" :key="opt.key" :label="opt.label" :value="opt.key" />
  </el-select>
</template>

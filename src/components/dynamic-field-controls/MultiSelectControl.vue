<script setup lang="ts">
/**
 * 多选（MULTISELECT）控件：候选选项来自字段定义 options（键值对，兼容历史 string[]）。
 * 展示 value、提交 key（与字典 code 同语义）；空键行（编辑中间态）不渲染。
 * 主渲染与子表单元格共用（subField=true → size=small）。
 */
import { computed } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import {
  parseFormFieldOptions,
  type FormFieldOption,
  type MultiSelectField,
} from '@/contracts/form-schema'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const options = computed<FormFieldOption[]>(() => {
  const field = props.field as MultiSelectField
  return parseFormFieldOptions(field?.options).filter((o) => o.key !== '')
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
    <el-option
      v-for="opt in options"
      :key="opt.key"
      :label="opt.value || opt.key"
      :value="opt.key"
    />
  </el-select>
</template>

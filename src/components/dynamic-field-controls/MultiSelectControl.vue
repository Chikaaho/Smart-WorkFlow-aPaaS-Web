<script setup lang="ts">
/**
 * 多选（MULTISELECT）控件：候选选项来自字段定义 options，值为字符串数组。
 * 主渲染与子表单元格共用（subField=true → size=small）。
 */
import { computed } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import type { MultiSelectField } from '@/contracts/form-schema'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const options = computed<string[]>(() => {
  const field = props.field as MultiSelectField
  return Array.isArray(field.options) ? field.options : []
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
    <el-option v-for="opt in options" :key="opt" :label="opt" :value="opt" />
  </el-select>
</template>

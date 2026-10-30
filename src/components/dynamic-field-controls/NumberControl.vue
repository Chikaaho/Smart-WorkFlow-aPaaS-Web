<script setup lang="ts">
/**
 * 数字（NUMBER）控件。
 * 主渲染与子表单元格共用；只读保留实际数值，编辑使用数字步进控件。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import ReadonlyValue from './ReadonlyValue.vue'

defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <ReadonlyValue v-if="readonly" :plain="subField">{{
    modelValue == null || modelValue === '' ? '—' : modelValue
  }}</ReadonlyValue>
  <el-input-number
    v-else
    :size="subField ? 'small' : undefined"
    :model-value="Number(modelValue ?? 0)"
    :disabled="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

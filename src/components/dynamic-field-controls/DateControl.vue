<script setup lang="ts">
/**
 * 日期（DATE）控件，valueFormat 固定 YYYY-MM-DD。
 * 主渲染与子表单元格共用（subField=true → size=small），readonly 语义为 disabled。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <el-date-picker
    :size="subField ? 'small' : undefined"
    value-format="YYYY-MM-DD"
    :model-value="String(modelValue ?? '')"
    :disabled="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
/**
 * 单行文本（TEXT）控件。
 * 主渲染与子表单元格共用（subField=true → size=small），readonly 语义为 input 只读。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <el-input
    :size="subField ? 'small' : undefined"
    :model-value="String(modelValue ?? '')"
    :readonly="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

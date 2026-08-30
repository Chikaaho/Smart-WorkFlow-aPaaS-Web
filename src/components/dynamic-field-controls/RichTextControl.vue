<script setup lang="ts">
/**
 * 多行文本（RICH_TEXT，降级 textarea）控件。
 * 主渲染 rows=4 / 子表单元格 rows=3（subField=true），readonly 语义为 input 只读。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <el-input
    :size="subField ? 'small' : undefined"
    type="textarea"
    :rows="subField ? 3 : 4"
    :model-value="String(modelValue ?? '')"
    :readonly="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

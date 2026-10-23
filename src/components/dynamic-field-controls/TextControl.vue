<script setup lang="ts">
/**
 * 单行文本（TEXT）控件。
 * 主渲染与子表单元格共用；只读显示实际值，编辑保留原输入控件。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import ReadonlyValue from './ReadonlyValue.vue'

defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <ReadonlyValue v-if="readonly" :plain="subField">{{
    String(modelValue ?? '') || '—'
  }}</ReadonlyValue>
  <el-input
    v-else
    :size="subField ? 'small' : undefined"
    :model-value="String(modelValue ?? '')"
    :placeholder="(field as { placeholder?: string }).placeholder"
    :readonly="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

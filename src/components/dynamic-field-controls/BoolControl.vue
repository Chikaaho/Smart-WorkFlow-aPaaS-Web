<script setup lang="ts">
/**
 * 开关（BOOL）控件。
 * 主渲染与子表单元格共用（subField=true → size=small），readonly 语义为 disabled。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <el-switch
    :size="subField ? 'small' : undefined"
    :model-value="Boolean(modelValue)"
    :disabled="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

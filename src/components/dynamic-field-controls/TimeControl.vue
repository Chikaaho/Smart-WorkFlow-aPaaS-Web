<script setup lang="ts">
/**
 * 时间（TIME）控件（I2），valueFormat 固定 HH:mm:ss。
 * 主渲染与子表单元格共用（subField=true → size=small），readonly 语义为 disabled。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <el-time-picker
    :size="subField ? 'small' : undefined"
    value-format="HH:mm:ss"
    :model-value="(modelValue as string) ?? ''"
    :disabled="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

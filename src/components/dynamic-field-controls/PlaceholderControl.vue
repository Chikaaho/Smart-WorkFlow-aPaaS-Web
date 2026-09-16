<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 子表单元格降级占位输入框。
 * REFERENCE（文本占位）/ TABLE（不递归）/ 未注册类型（兜底）在子表内统一渲染本组件，
 * 由注册表 `getSubFieldComponent` 决议，消费方零感知。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <el-input
    size="small"
    :model-value="String(modelValue ?? '')"
    :placeholder="t('component.referenceTextPlaceholder')"
    :readonly="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
/**
 * 说明文字（LABEL）控件：非输入字段，纯展示，不产生业务载荷。
 * 展示正文取 field.text（缺省回退 label）。
 */
import { computed } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import type { LabelField } from '@/contracts/form-schema'

const props = defineProps<DynamicFieldControlProps>()

const text = computed(() => {
  const field = props.field as LabelField
  return field.text || field.label || field.name
})
</script>

<template>
  <div class="label-control">{{ text }}</div>
</template>

<style scoped>
.label-control {
  padding: 6px 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sw-color-text-secondary, #606266);
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 4px;
  padding: 8px 12px;
}
</style>

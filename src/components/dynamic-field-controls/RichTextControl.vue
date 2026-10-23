<script setup lang="ts">
/**
 * 多行文本（RICH_TEXT，降级 textarea）控件。
 * 编辑时主字段 rows=4、子表 rows=3；只读保留换行并自然显示完整内容。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import ReadonlyValue from './ReadonlyValue.vue'

defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>

<template>
  <ReadonlyValue v-if="readonly" :plain="subField" multiline>{{
    String(modelValue ?? '') || '—'
  }}</ReadonlyValue>
  <el-input
    v-else
    :size="subField ? 'small' : undefined"
    type="textarea"
    :rows="subField ? 3 : 4"
    :model-value="String(modelValue ?? '')"
    :readonly="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

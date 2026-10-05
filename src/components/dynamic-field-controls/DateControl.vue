<script setup lang="ts">
/**
 * 日期（DATE）控件，缺省 valueFormat 固定 YYYY-MM-DD。
 * P63：definition format="datetime" 时切换日期时间选择（type=datetime，
 * 值 YYYY-MM-DD HH:mm:ss）；缺省 date 语义不变。
 * 主渲染与子表单元格共用（subField=true → size=small），readonly 语义为 disabled。
 */
import { computed } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

const props = defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()

/** 日期时间格式（P63）：definition format="datetime" 时启用时间选择。 */
const isDatetime = computed(() => (props.field as { format?: string }).format === 'datetime')
</script>

<template>
  <el-date-picker
    :size="subField ? 'small' : undefined"
    :type="isDatetime ? 'datetime' : 'date'"
    :value-format="isDatetime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'"
    :model-value="String(modelValue ?? '')"
    :placeholder="(field as { placeholder?: string }).placeholder"
    :disabled="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

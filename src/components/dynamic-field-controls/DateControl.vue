<script setup lang="ts">
/**
 * 日期（DATE）控件，缺省 valueFormat 固定 YYYY-MM-DD。
 * P63：definition format="datetime" 时切换日期时间选择（type=datetime，
 * 值 YYYY-MM-DD HH:mm:ss）；缺省 date 语义不变。
 * 主渲染与子表单元格共用；只读回看展示本地时间，编辑使用原日期选择器。
 */
import { computed } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import calendarIcon from '@/assets/form-palette/calendar.svg'
import ReadonlyValue from './ReadonlyValue.vue'
import { normalizeFormDateValue } from '@/contracts/form-date'

const props = defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()

/** 日期时间格式（P63）：definition format="datetime" 时启用时间选择。 */
const isDatetime = computed(() => (props.field as { format?: string }).format === 'datetime')

/** 查询可能返回带时区的时间戳；先还原浏览器本地时间，再交给 value-format 控件。 */
const localValue = computed(() => normalizeFormDateValue(props.modelValue, isDatetime.value))
const readonlyValue = computed(() =>
  isDatetime.value
    ? localValue.value.replace('T', ' ').replace(/(\d{2}:\d{2}):00$/, '$1')
    : localValue.value,
)
</script>

<template>
  <ReadonlyValue
    v-if="readonly"
    class="date-readonly"
    :plain="subField"
    :trailing-icon="calendarIcon"
  >
    <span>{{ readonlyValue || '—' }}</span>
  </ReadonlyValue>
  <el-date-picker
    v-else
    :size="subField ? 'small' : undefined"
    :type="isDatetime ? 'datetime' : 'date'"
    :value-format="isDatetime ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'"
    :model-value="localValue"
    :placeholder="(field as { placeholder?: string }).placeholder"
    :disabled="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<style scoped>
.date-readonly span {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>

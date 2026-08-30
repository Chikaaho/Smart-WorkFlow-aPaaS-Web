<script setup lang="ts">
/**
 * 字典选择（DICT）控件，走 DictSelect 通道（支持 select/radio 变体）。
 * 主渲染与子表单元格共用（subField=true → size=small），readonly 语义为 disabled。
 */
import { computed } from 'vue'
import type { DictField } from '@/contracts/form-schema'
import DictSelect from '@/foundation/dict/DictSelect.vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

const props = defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()

/** dictType / renderAs 仅在 DICT 判别子下存在（子表单元格传 TableSubField 同样成立）。 */
const dictType = computed(() =>
  props.field.type === 'DICT' ? (props.field as DictField).dictType : '',
)
const renderAs = computed(() =>
  props.field.type === 'DICT' ? (props.field as DictField).renderAs : undefined,
)
</script>

<template>
  <DictSelect
    :size="subField ? 'small' : undefined"
    :type="dictType"
    :render-as="renderAs"
    :model-value="String(modelValue ?? '')"
    :disabled="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

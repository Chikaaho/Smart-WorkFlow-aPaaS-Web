<script setup lang="ts">
/**
 * 下拉选择（DICT）控件。
 * BF20261013-009：数据来源 dict=系统字典（useDict 装载）/ custom=自定义候选键值对；
 * 下拉支持单选 / 多选（multiple，值=key/code 字符串数组），renderAs=radio 渲染单选按钮组。
 * 展示 value、提交 key；主渲染与子表单元格共用（subField=true → size=small）。
 */
import { computed } from 'vue'
import { useI18n } from '@/locales'
import {
  parseFormFieldOptions,
  type DictField,
  type FormFieldOption,
} from '@/contracts/form-schema'
import { useDict } from '@/foundation/dict'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

const { t } = useI18n()

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const field = computed(() => (props.field.type === 'DICT' ? (props.field as DictField) : null))
const dictType = computed(() => field.value?.dictType ?? '')
const source = computed(() => field.value?.source ?? 'dict')
const renderAs = computed(() => field.value?.renderAs ?? 'select')
/** 多选仅在下拉形态生效；单选按钮组恒单选（与配置面板约束一致）。 */
const multiple = computed(() => renderAs.value === 'select' && Boolean(field.value?.multiple))

const customOptions = computed<FormFieldOption[]>(() =>
  parseFormFieldOptions(field.value?.options).filter((o) => o.key !== ''),
)

// 字典来源：装载系统字典项（缓存/在途去重由 foundation 兜底）
const { items: dictItems } = useDict(dictType.value)

/** 统一选项形态：key=提交值（自定义键/字典 code）、label=展示名。 */
interface NamedOption {
  key: string
  label: string
}

const options = computed<NamedOption[]>(() =>
  source.value === 'custom'
    ? customOptions.value.map((o) => ({ key: o.key, label: o.value || o.key }))
    : dictItems.value.map((i) => ({ key: String(i.value), label: i.label })),
)

const modelValue = computed<string | string[]>(() => {
  if (multiple.value) {
    return Array.isArray(props.modelValue) ? (props.modelValue as string[]) : []
  }
  return props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue)
})

/** 单选按钮组恒为单值形态（radio 不接受数组）。 */
const radioValue = computed<string>(() =>
  props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue),
)

function onChange(next: unknown) {
  if (multiple.value) {
    emit('update:modelValue', Array.isArray(next) ? next : [])
    return
  }
  emit('update:modelValue', next == null ? undefined : String(next))
}
</script>

<template>
  <el-select
    v-if="renderAs === 'select'"
    :size="subField ? 'small' : undefined"
    :model-value="modelValue"
    :multiple="multiple"
    :disabled="readonly"
    clearable
    :placeholder="t('common.pleaseSelect')"
    @update:model-value="onChange"
  >
    <el-option v-for="opt in options" :key="opt.key" :label="opt.label" :value="opt.key" />
  </el-select>

  <el-radio-group
    v-else
    :model-value="radioValue"
    :disabled="readonly"
    @update:model-value="onChange"
  >
    <el-radio v-for="opt in options" :key="opt.key" :value="opt.key">
      {{ opt.label }}
    </el-radio>
  </el-radio-group>
</template>

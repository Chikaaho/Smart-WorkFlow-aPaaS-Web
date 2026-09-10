<script setup lang="ts">
/**
 * 受控外部数据源（DATASOURCE）控件（I2）。
 * 值 = 稳定对象标识（valueField 列）；候选经服务端统一查询入口加载
 * （/form/ext/query/{queryKey}），SQL/密钥不出服务端；
 * 提交时服务端按契约解析 display 并冻结摘要，伪造/越权对象被拒绝。
 */
import { onMounted, ref } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import type { DatasourceField } from '@/contracts/form-schema'
import { extQuery, type ExtQueryRow } from '@/modules/form/api/i2-choices'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

interface Option {
  value: string
  label: string
}

const options = ref<Option[]>([])

onMounted(async () => {
  const field = props.field as DatasourceField
  const binding = field.dsBinding
  if (!binding?.queryKey) return
  try {
    const result = await extQuery(binding.queryKey, binding.version)
    options.value = (result.rows ?? []).map((row: ExtQueryRow) => ({
      value: String(row[binding.valueField] ?? ''),
      label: String(row[binding.displayField] ?? row[binding.valueField] ?? ''),
    }))
  } catch {
    // 契约缺失/停用/超限为可判定失败：不伪造候选，留空由服务端提交链兜底
    options.value = []
  }
  const current =
    props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue)
  if (current && !options.value.some((o) => o.value === current)) {
    options.value = [...options.value, { value: current, label: current }]
  }
})

function onChange(value: unknown) {
  emit('update:modelValue', value === '' ? null : value)
}
</script>

<template>
  <el-select
    :size="subField ? 'small' : undefined"
    :model-value="modelValue === null || modelValue === undefined ? '' : String(modelValue)"
    filterable
    clearable
    :disabled="readonly"
    placeholder="选择数据对象"
    @change="onChange"
  >
    <el-option v-for="o in options" :key="o.value" :label="o.label" :value="o.value" />
  </el-select>
</template>

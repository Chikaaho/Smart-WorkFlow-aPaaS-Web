<script setup lang="ts">
/**
 * 部门选择（DEPT）控件（I2）。
 * 值 = 数字型部门 ID（存 id，展示部门名）；候选经系统部门树接口加载
 * （服务端按当前租户/正常状态过滤）；存在性与越权最终由后端提交链校验。
 */
import { onMounted, ref } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import { loadDeptChoices } from '@/modules/form/api/i2-choices'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

interface Option {
  id: string
  label: string
}

const options = ref<Option[]>([])

onMounted(async () => {
  try {
    options.value = await loadDeptChoices()
  } catch {
    options.value = []
  }
  const current =
    props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue)
  if (current && !options.value.some((o) => o.id === current)) {
    options.value = [...options.value, { id: current, label: current }]
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
    placeholder="选择部门"
    @change="onChange"
  >
    <el-option v-for="o in options" :key="o.id" :label="o.label" :value="o.id" />
  </el-select>
</template>

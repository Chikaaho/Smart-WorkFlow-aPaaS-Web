<script setup lang="ts">
/**
 * 人员选择（USER）控件（I2）。
 * 值 = 数字型用户 ID（存 id，展示 realName/username）；候选经系统用户查询接口
 * 服务端按当前租户/启用状态过滤；存在性与越权最终由后端提交链校验。
 * readonly 语义：禁用搜索与清空。
 */
import { onMounted, ref } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import { loadUserChoices } from '@/modules/form/api/i2-choices'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

interface Option {
  id: string
  label: string
}

const options = ref<Option[]>([])

onMounted(async () => {
  try {
    options.value = await loadUserChoices()
  } catch {
    options.value = []
  }
  ensureSelectedLabel()
})

/** 回显：当前值不在候选（如已停用）时保留服务端语义，展示原始 ID 不伪造姓名。 */
function ensureSelectedLabel() {
  const current =
    props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue)
  if (current && !options.value.some((o) => o.id === current)) {
    options.value = [...options.value, { id: current, label: current }]
  }
}

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
    placeholder="选择人员"
    @change="onChange"
  >
    <el-option v-for="o in options" :key="o.id" :label="o.label" :value="o.id" />
  </el-select>
</template>

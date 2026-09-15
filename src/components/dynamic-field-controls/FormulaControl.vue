<script setup lang="ts">
/**
 * 公式（FORMULA）控件（I2）：只读展示。
 * 客户端不计算公式——值来自服务端（提交后重算落列、编辑回显读库），
 * 前端任何计算结果都不构成正式结果。
 */
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

defineProps<DynamicFieldControlProps>()
</script>

<template>
  <el-input
    :size="subField ? 'small' : undefined"
    :model-value="modelValue === null || modelValue === undefined ? '' : String(modelValue)"
    disabled
    placeholder="服务端计算"
  />
</template>

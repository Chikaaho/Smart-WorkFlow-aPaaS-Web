<script setup lang="ts">
/**
 * 文字（LABEL）控件：非输入字段，纯展示，不产生业务载荷。
 * 展示正文取 field.text（缺省回退 label / name）；颜色 / 字号 / 粗细来自字段属性。
 * 设计态（FormPreview 经 TextDisplay 注册）与填报态共用本组件，所见即所得。
 */
import { computed } from 'vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import type { LabelField } from '@/contracts/form-schema'

const props = defineProps<DynamicFieldControlProps>()

const field = computed(() => props.field as LabelField)

const text = computed(() => field.value.text || field.value.label || field.value.name)

/** 仅当设计者显式配置颜色 / 字号 / 粗细时才覆盖默认样式。 */
const styleVars = computed<Record<string, string>>(() => {
  const f = field.value
  const vars: Record<string, string> = {}
  if (f.color) vars.color = f.color
  if (typeof f.fontSize === 'number' && f.fontSize > 0) vars.fontSize = `${f.fontSize}px`
  if (f.fontWeight) vars.fontWeight = f.fontWeight
  return vars
})
</script>

<template>
  <div class="label-control" :style="styleVars">{{ text }}</div>
</template>

<style scoped>
.label-control {
  font-size: 13px;
  line-height: 1.6;
  color: var(--sw-text-regular, #303a55);
  word-break: break-word;
}
</style>

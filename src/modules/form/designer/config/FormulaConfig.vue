<script setup lang="ts">
/**
 * FormulaConfig — I2 FORMULA 字段配置面板。
 * 编辑 expression（${field} 引用 + 四则 + 白名单函数 ABS/ROUND/MIN/MAX/DAYS）。
 * 语法与依赖（未知字段/循环）由服务端发布门校验；客户端值不消费。
 */
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import type { FormulaField, FormSchemaField } from '@/contracts/form-schema'

const props = defineProps<{
  field: FormSchemaField
  /** 同表单内**其它**字段的列名（重名校验用）。 */
  otherNames: string[]
}>()

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

function expressionValue(): string {
  return ((props.field as FormulaField).expression ?? '') as string
}

function onExpression(value: string) {
  emit('update', { expression: value })
}
</script>

<template>
  <CommonConfigRows
    :label="field.label ?? field.name"
    :name="field.name"
    :required="false"
    :other-names="otherNames"
    :field-type="field.type"
    :default-value="field.defaultValue"
    :show-required="false"
    @update="(p) => emit('update', p)"
  />

  <div class="row">
    <label class="row__label">公式表达式</label>
    <el-input
      :model-value="expressionValue()"
      type="textarea"
      :rows="3"
      placeholder="如：ROUND(${price} * ${qty}, 2)；支持 + - * / 与 ABS/ROUND/MIN/MAX/DAYS"
      @update:model-value="onExpression"
    />
    <p class="row__hint">字段用 ${name} 引用；正式提交由服务端按发布版本重算，客户端值不消费。</p>
  </div>
</template>

<style scoped>
.row {
  margin-bottom: var(--sw-space-16);
}
.row__label {
  display: block;
  margin-bottom: var(--sw-space-4);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-regular);
}
.row__hint {
  margin-top: var(--sw-space-4);
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}
</style>

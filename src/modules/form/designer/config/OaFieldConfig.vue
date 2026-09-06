<script setup lang="ts">
/**
 * OaFieldConfig — v0.0.2 新控件（MULTISELECT/ATTACHMENT/IMAGE/LABEL）配置面板。
 * MULTISELECT 编辑候选选项（逗号分隔）；LABEL 编辑说明正文；
 * 通用行（标签/列名/必填/默认值）复用 CommonConfigRows。
 */
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import type { MultiSelectField, LabelField, FormSchemaField } from '@/contracts/form-schema'

const props = defineProps<{
  field: FormSchemaField
  /** 同表单内**其它**字段的列名（重名校验用）。 */
  otherNames: string[]
}>()

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

function optionsText(): string {
  const field = props.field as MultiSelectField
  return Array.isArray(field.options) ? field.options.join(', ') : ''
}

function onOptionsText(value: string) {
  const options = value
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  emit('update', { options })
}

function onText(value: string) {
  emit('update', { text: value })
}

function textValue(): string {
  return ((props.field as LabelField).text ?? '') as string
}
</script>

<template>
  <CommonConfigRows
    :label="field.label ?? field.name"
    :name="field.name"
    :required="Boolean(field.required)"
    :other-names="otherNames"
    :field-type="field.type"
    :default-value="field.defaultValue"
    :show-required="field.type !== 'LABEL'"
    @update="(p) => emit('update', p)"
  />

  <div v-if="field.type === 'MULTISELECT'" class="row">
    <label class="row__label">候选选项</label>
    <el-input
      :model-value="optionsText()"
      placeholder="逗号分隔的选项，如：餐饮, 交通, 住宿"
      @update:model-value="onOptionsText"
    />
  </div>

  <div v-if="field.type === 'LABEL'" class="row">
    <label class="row__label">说明正文</label>
    <el-input
      :model-value="textValue()"
      type="textarea"
      :rows="3"
      placeholder="展示给填报人的说明文字"
      @update:model-value="onText"
    />
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
</style>

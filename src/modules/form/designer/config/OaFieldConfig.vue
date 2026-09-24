<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * OaFieldConfig — v0.0.2 新控件（MULTISELECT/ATTACHMENT/IMAGE/LABEL）配置面板。
 * MULTISELECT 编辑候选选项（逗号分隔）；LABEL 编辑文字正文与颜色/字号/粗细/对齐；
 * 通用行（标签/列名/必填/默认值）复用 CommonConfigRows。
 */
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import {
  DEFAULT_FIELD_TEXT_ALIGN,
  type FieldTextAlign,
  type MultiSelectField,
  type LabelField,
  type FormSchemaField,
} from '@/contracts/form-schema'

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

/* ── 文字（LABEL）样式属性：颜色 / 字号 / 粗细 ── */

const DEFAULT_LABEL_FONT_SIZE = 14

function colorValue(): string {
  return ((props.field as LabelField).color ?? '') as string
}

function onColor(value: string | null) {
  emit('update', { color: value ?? '' })
}

function fontSizeValue(): number {
  const size = (props.field as LabelField).fontSize
  return typeof size === 'number' && size > 0 ? size : DEFAULT_LABEL_FONT_SIZE
}

function onFontSize(value: number | undefined) {
  emit('update', { fontSize: value ?? undefined })
}

function fontWeightValue(): 'normal' | 'bold' {
  return ((props.field as LabelField).fontWeight ?? 'normal') as 'normal' | 'bold'
}

function onFontWeight(value: string | number | boolean) {
  emit('update', { fontWeight: value === 'bold' ? 'bold' : 'normal' })
}

function textAlignValue(): FieldTextAlign {
  return ((props.field as LabelField).textAlign ?? DEFAULT_FIELD_TEXT_ALIGN) as FieldTextAlign
}

function onTextAlign(value: string | number | boolean | undefined) {
  const align: FieldTextAlign =
    value === 'center' || value === 'right' ? value : DEFAULT_FIELD_TEXT_ALIGN
  emit('update', { textAlign: align })
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
    <label class="row__label">{{ t('form.multiselectOptions') }}</label>
    <el-input
      :model-value="optionsText()"
      :placeholder="t('form.multiselectOptionsPlaceholder')"
      @update:model-value="onOptionsText"
    />
  </div>

  <template v-if="field.type === 'LABEL'">
    <div class="row">
      <label class="row__label">{{ t('form.labelBody') }}</label>
      <el-input
        :model-value="textValue()"
        type="textarea"
        :rows="3"
        :placeholder="t('form.labelBodyPlaceholder')"
        @update:model-value="onText"
      />
    </div>

    <div class="row">
      <label class="row__label">{{ t('form.labelColor') }}</label>
      <el-color-picker
        :model-value="colorValue()"
        :predefine="[
          '#172033',
          '#303a55',
          '#6b7280',
          '#6f2dff',
          '#d93026',
          '#1f9d55',
          '#2563eb',
          '#d97706',
        ]"
        @update:model-value="onColor"
      />
    </div>

    <div class="row row--inline">
      <label class="row__label">{{ t('form.labelFontSize') }}</label>
      <el-input-number
        :model-value="fontSizeValue()"
        :min="8"
        :max="72"
        :step="1"
        class="row__number"
        @update:model-value="onFontSize"
      />
    </div>

    <div class="row row--inline">
      <label class="row__label">{{ t('form.labelFontWeight') }}</label>
      <el-select
        :model-value="fontWeightValue()"
        class="row__select"
        @update:model-value="onFontWeight"
      >
        <el-option :label="t('form.fontWeightNormal')" value="normal" />
        <el-option :label="t('form.fontWeightBold')" value="bold" />
      </el-select>
    </div>

    <div class="row">
      <label class="row__label">{{ t('form.labelTextAlign') }}</label>
      <el-radio-group
        :model-value="textAlignValue()"
        class="row__align"
        @update:model-value="onTextAlign"
      >
        <el-radio-button value="left">{{ t('form.textAlignLeft') }}</el-radio-button>
        <el-radio-button value="center">{{ t('form.textAlignCenter') }}</el-radio-button>
        <el-radio-button value="right">{{ t('form.textAlignRight') }}</el-radio-button>
      </el-radio-group>
    </div>
  </template>
</template>

<style scoped>
.row {
  margin-bottom: var(--sw-space-16);
}

.row--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row--inline .row__label {
  margin-bottom: 0;
}

.row__number {
  width: 120px;
}

.row__select {
  width: 120px;
}

/* 对齐方式：三等分按钮，左右铺满面板 */
.row__align {
  display: flex;
  width: 100%;
}

.row__align :deep(.el-radio-button) {
  flex: 1 1 0;
}

.row__align :deep(.el-radio-button__inner) {
  width: 100%;
}
.row__label {
  display: block;
  margin-bottom: var(--sw-space-4);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-regular);
}
</style>

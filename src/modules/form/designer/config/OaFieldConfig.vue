<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * OaFieldConfig — v0.0.2 新控件（MULTISELECT/ATTACHMENT/IMAGE/LABEL/USER/DEPT/TIME）配置面板。
 * MULTISELECT 编辑候选选项（键值对：左键右值，键不含空白且不重复，BF20261013-008）；
 * LABEL 编辑文字正文与颜色/字号/粗细/对齐；
 * USER/DEPT 编辑多选开关（P63，写 definition multiple，缺省单选）；
 * 通用行（标签/列名/必填/默认值）复用 CommonConfigRows。
 */
import { computed, ref, watch } from 'vue'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import {
  parseFormFieldOptions,
  DEFAULT_FIELD_TEXT_ALIGN,
  type FieldTextAlign,
  type LabelField,
  type UserField,
  type DeptField,
  type FormSchemaField,
} from '@/contracts/form-schema'

const props = defineProps<{
  field: FormSchemaField
  /** 同表单内**其它**字段的列名（重名校验用）。 */
  otherNames: string[]
}>()

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

/* ── 多选候选选项（键值对，BF20261013-008） ── */

interface OptionRow {
  key: string
  value: string
}

/** 行编辑器本地草稿：保留空行（增量输入中间态），随选中字段切换/定义回写重播种。 */
const optionRows = ref<OptionRow[]>([])

watch(
  () => props.field,
  (f) => {
    if (f.type !== 'MULTISELECT') return
    optionRows.value = parseFormFieldOptions(f.options).map((o) => ({ ...o }))
  },
  { immediate: true },
)

function emitOptions() {
  emit('update', { options: optionRows.value.map((r) => ({ ...r })) })
}

/** 键不允许任何空白字符（空格/制表符），输入即剔除；值保留原文（展示名可含空格）。 */
function onOptionKey(index: number, raw: string) {
  optionRows.value[index].key = raw.replace(/\s+/g, '')
  emitOptions()
}

function onOptionValue(index: number, raw: string) {
  optionRows.value[index].value = raw
  emitOptions()
}

function addOptionRow() {
  optionRows.value.push({ key: '', value: '' })
  emitOptions()
}

function removeOptionRow(index: number) {
  optionRows.value.splice(index, 1)
  emitOptions()
}

/** UX 提示（不拦输入）：已填值的行缺键、或键重复。真把关在后端发布/运行时过滤。 */
const optionKeyError = computed(() => {
  if (optionRows.value.some((r) => r.key === '' && r.value !== '')) {
    return t('form.optionKeyEmpty')
  }
  const keys = optionRows.value.filter((r) => r.key !== '').map((r) => r.key)
  const duplicated = keys.find((k, i) => keys.indexOf(k) !== i)
  return duplicated ? t('form.optionKeyDuplicate') : ''
})

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

/* ── 人员/部门（USER/DEPT）多选（P63） ── */

/** USER/DEPT 才有 multiple 键；缺省单选（false/缺省均按单选渲染）。 */
function isPickerMultiple(): boolean {
  const field = props.field as UserField | DeptField
  return field.type === 'USER' || field.type === 'DEPT' ? Boolean(field.multiple) : false
}

/** 关闭时写 undefined（JSON 序列化丢键），保持「缺省单选」的干净入库形状。 */
function onPickerMultiple(value: string | number | boolean) {
  emit('update', { multiple: value ? true : undefined })
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

  <!-- BF20261013-008：候选选项键值对编辑——一行两输入框（左键右值），键无空格不重复，新增加一行 -->
  <div v-if="field.type === 'MULTISELECT'" class="row">
    <label class="row__label">{{ t('form.multiselectOptions') }}</label>
    <div v-for="(row, i) in optionRows" :key="i" class="row__kv">
      <el-input
        :model-value="row.key"
        :placeholder="t('form.optionKeyPlaceholder')"
        @update:model-value="(v: string) => onOptionKey(i, v)"
      />
      <el-input
        :model-value="row.value"
        :placeholder="t('form.optionValuePlaceholder')"
        @update:model-value="(v: string) => onOptionValue(i, v)"
      />
      <button
        type="button"
        class="row__kv-del"
        :aria-label="t('form.optionRemoveRow')"
        @click="removeOptionRow(i)"
      >
        ×
      </button>
    </div>
    <el-button class="row__kv-add" size="small" @click="addOptionRow">
      {{ t('form.optionAddRow') }}
    </el-button>
    <p v-if="optionKeyError" class="row__error">{{ optionKeyError }}</p>
  </div>

  <!-- P63：人员/部门多选开关（写入 definition multiple；子表子字段同样可用） -->
  <div v-if="field.type === 'USER' || field.type === 'DEPT'" class="row row--inline">
    <label class="row__label">{{ t('form.fieldTypeMultiSelect') }}</label>
    <el-switch :model-value="isPickerMultiple()" @update:model-value="onPickerMultiple" />
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

/* 键值对行：左键右值 + 删除；新增加行按钮 */
.row__kv {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  margin-bottom: var(--sw-space-8);
}

.row__kv :deep(.el-input) {
  flex: 1 1 0;
  min-width: 0;
}

.row__kv-del {
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: #f1f4fa;
  color: #8a96ae;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.row__kv-del:hover {
  color: var(--sw-danger);
  background: #fdecec;
}

.row__kv-add {
  margin-top: 2px;
}

.row__error {
  margin: var(--sw-space-4) 0 0;
  font-size: var(--sw-font-caption);
  color: var(--sw-danger);
}
</style>

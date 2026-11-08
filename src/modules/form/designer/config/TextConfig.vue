<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 文本（TEXT）类型专属配置。
 * P53：组件名称/宽度/占位/必填/字段标识已上收 FieldConfigPanel 通用三段；
 * 本组件保留类型专属「输入方式（单行/多行）」「最大长度」「默认值」，
 * 以及只读 JSON 参数的「键名/取值中文映射」（0.3.6，仅影响展示，存储/API 不变）。
 */
import type { TextField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'

const props = defineProps<{ field: TextField; otherNames: string[]; hideLength?: boolean }>()
const emit = defineEmits<{ update: [patch: FieldPatch] }>()

/** 「键=中文名」逐行文本 ↔ Record 互转；非法行（无 = 或空键/空值）忽略。 */
function mappingToText(mapping: Record<string, string> | undefined): string {
  if (!mapping) return ''
  return Object.entries(mapping)
    .map(([key, label]) => `${key}=${label}`)
    .join('\n')
}

function textToMapping(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const label = trimmed.slice(eq + 1).trim()
    if (!key || !label) continue
    out[key] = label
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// 映射编辑用本地文本态：逐键中间态（如刚输入键名还没输入 =）不是合法映射，
// 不能直接绑字段值（会被丢弃导致输入回跳）；切换选中字段时再从字段重同步。
const keyText = ref('')
const valueText = ref('')

watch(
  () => props.field,
  (field) => {
    keyText.value = mappingToText(field.jsonDisplay?.keyLabels)
    valueText.value = mappingToText(field.jsonDisplay?.valueLabels)
  },
  { immediate: true },
)

function patchJsonDisplay(part: 'keyLabels' | 'valueLabels', text: string): void {
  const local = { keyText: keyText.value, valueText: valueText.value }
  local[part === 'keyLabels' ? 'keyText' : 'valueText'] = text
  const next = {
    keyLabels: textToMapping(local.keyText),
    valueLabels: textToMapping(local.valueText),
  }
  if (!next.keyLabels && !next.valueLabels) emit('update', { jsonDisplay: undefined })
  else emit('update', { jsonDisplay: next })
}
</script>

<template>
  <div>
    <div class="row">
      <label class="row__label">{{ t('form.fieldInputMode') }}</label>
      <el-select
        :model-value="props.field.multiline ? 'multiline' : 'single'"
        class="row__control"
        @update:model-value="(v: string) => emit('update', { multiline: v === 'multiline' })"
      >
        <el-option :label="t('form.fieldInputModeSingle')" value="single" />
        <el-option :label="t('form.fieldInputModeMultiline')" value="multiline" />
      </el-select>
    </div>
    <div v-if="!props.hideLength" class="row">
      <label class="row__label">{{ t('form.maxLength') }}</label>
      <el-input-number
        :model-value="props.field.length"
        :min="1"
        :controls="true"
        :placeholder="t('form.unlimited')"
        class="row__control"
        @update:model-value="(v: number | undefined) => emit('update', { length: v })"
      />
    </div>
    <div class="row">
      <label class="row__label">{{ t('form.defaultValue') }}</label>
      <el-input
        :model-value="typeof props.field.defaultValue === 'string' ? props.field.defaultValue : ''"
        :placeholder="t('form.defaultValueExprPlaceholder')"
        @update:model-value="(v: string) => emit('update', { defaultValue: v || undefined })"
      />
    </div>
    <div class="row">
      <label class="row__label">{{ t('form.jsonKeyLabels') }}</label>
      <el-input
        v-model="keyText"
        type="textarea"
        :rows="4"
        :placeholder="t('form.jsonKeyLabelsPlaceholder')"
        @update:model-value="(v: string) => patchJsonDisplay('keyLabels', v)"
      />
    </div>
    <div class="row">
      <label class="row__label">{{ t('form.jsonValueLabels') }}</label>
      <el-input
        v-model="valueText"
        type="textarea"
        :rows="3"
        :placeholder="t('form.jsonValueLabelsPlaceholder')"
        @update:model-value="(v: string) => patchJsonDisplay('valueLabels', v)"
      />
    </div>
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

.row__control {
  width: 100%;
}
</style>

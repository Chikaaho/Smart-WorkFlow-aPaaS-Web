<script setup lang="ts">
/**
 * 文本（TEXT）控件：单行输入，或多行纯文本（textarea，换行原样保存）。
 * 主渲染与子表单元格共用；只读显示实际值，编辑保留原输入控件。
 * 只读值为 JSON 对象（如设备指令参数）时按字段逐行展示，
 * 键名/取值按 jsonDisplay 中文映射显示（0.3.6，无映射回退原键名/原值）；
 * 原文收进折叠的「技术参数」，仅管理员/设计者（form:design:save）可见。
 */
import { computed } from 'vue'
import type { TextJsonDisplay } from '@/contracts/form-schema'
import { hasPerm } from '@/foundation/permission'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import ReadonlyValue from './ReadonlyValue.vue'

const props = defineProps<DynamicFieldControlProps>()
defineEmits<{ 'update:modelValue': [value: unknown] }>()

function formatJsonValue(value: unknown, valueLabels?: Record<string, string>): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) {
    return (
      value
        .map((item) => {
          if (typeof item === 'object') return JSON.stringify(item)
          const text = String(item)
          return valueLabels && valueLabels[text] !== undefined ? valueLabels[text] : text
        })
        .join('、') || '—'
    )
  }
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value)
  return valueLabels && valueLabels[text] !== undefined ? valueLabels[text] : text
}

/** 只读 JSON 的中文映射（仅主字段只读 JSON 展示场景消费）。 */
const jsonDisplay = computed<TextJsonDisplay | undefined>(
  () => (props.field as { jsonDisplay?: TextJsonDisplay }).jsonDisplay,
)

/** 技术参数原文仅管理员/设计者可见（普通审批人只看中文字段视图）。 */
const canViewRawJson = computed(() => hasPerm('form:design:save'))

/** 只读 JSON 对象的字段视图；非对象或解析失败时为 null（按原文本显示）。 */
const jsonEntries = computed(() => {
  if (!props.readonly || props.subField) return null
  const text = String(props.modelValue ?? '').trim()
  if (!text.startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (entries.length === 0) return null
    const keyLabels = jsonDisplay.value?.keyLabels
    const valueLabels = jsonDisplay.value?.valueLabels
    return entries.map(([key, value]) => ({
      key,
      label: keyLabels && keyLabels[key] !== undefined ? keyLabels[key] : key,
      value: formatJsonValue(value, valueLabels),
    }))
  } catch {
    return null
  }
})

const jsonRaw = computed(() => {
  try {
    return JSON.stringify(JSON.parse(String(props.modelValue ?? '')), null, 2)
  } catch {
    return String(props.modelValue ?? '')
  }
})
</script>

<template>
  <div v-if="jsonEntries" class="readonly-json" data-testid="readonly-json">
    <dl class="readonly-json__grid">
      <div v-for="entry in jsonEntries" :key="entry.key" class="readonly-json__row">
        <dt>{{ entry.label }}</dt>
        <dd>{{ entry.value }}</dd>
      </div>
    </dl>
    <details v-if="canViewRawJson" class="readonly-json__raw">
      <summary>技术参数（JSON 原文）</summary>
      <pre>{{ jsonRaw }}</pre>
    </details>
  </div>
  <ReadonlyValue
    v-else-if="readonly"
    :plain="subField"
    :multiline="!subField && Boolean((field as { multiline?: boolean }).multiline)"
  >
    {{ String(modelValue ?? '') || '—' }}
  </ReadonlyValue>
  <el-input
    v-else
    :type="(field as { multiline?: boolean }).multiline ? 'textarea' : 'text'"
    :rows="(field as { multiline?: boolean }).multiline ? 3 : undefined"
    :size="subField ? 'small' : undefined"
    :model-value="String(modelValue ?? '')"
    :placeholder="(field as { placeholder?: string }).placeholder"
    :readonly="readonly"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<style scoped>
.readonly-json {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
}
.readonly-json__grid {
  margin: 0;
}
.readonly-json__row {
  display: flex;
  gap: 12px;
}
.readonly-json__row dt {
  flex: 0 0 auto;
  min-width: 112px;
  color: var(--sw-text-secondary);
}
.readonly-json__row dd {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.readonly-json__raw {
  margin-top: 6px;
  color: var(--sw-text-secondary);
  font-size: 12px;
}
.readonly-json__raw summary {
  cursor: pointer;
}
.readonly-json__raw pre {
  margin: 4px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>

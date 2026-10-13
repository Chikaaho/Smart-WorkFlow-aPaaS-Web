<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 通用配置行（BF20261013-012 精简）：仅保留「默认值」。
 *
 * 标签/列名/必填/占位提示等身份行由 FieldConfigPanel 统一承载（主字段与子字段同一面板），
 * 类型配置组件再渲染一遍会造成「两个必填」等重复，故此处只负责默认值。
 * 默认值按字段类型给输入形态（数组型=逗号分隔、布尔=下拉、其余=文本），仅新建填报无值时应用。
 */
import { computed } from 'vue'
import type { FieldPatch } from '../field-config'

const props = withDefaults(
  defineProps<{
    /** 字段类型（决定默认值输入形态）。 */
    fieldType?: string
    /** 现有默认值。 */
    defaultValue?: unknown
  }>(),
  { fieldType: 'TEXT', defaultValue: undefined },
)

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

/** 默认值输入形态：数组型=逗号分隔文本；布尔=下拉；其余=文本。 */
const defaultMode = computed<'array' | 'bool' | 'text'>(() => {
  if (['MULTISELECT', 'ATTACHMENT', 'IMAGE'].includes(props.fieldType)) return 'array'
  if (props.fieldType === 'BOOL') return 'bool'
  return 'text'
})

const defaultText = computed(() => {
  if (props.defaultValue === undefined || props.defaultValue === null) return ''
  if (Array.isArray(props.defaultValue)) return props.defaultValue.join(', ')
  if (typeof props.defaultValue === 'object') return JSON.stringify(props.defaultValue)
  return String(props.defaultValue)
})

function onDefaultText(v: string) {
  if (v === '') {
    emit('update', { defaultValue: undefined })
    return
  }
  if (defaultMode.value === 'array') {
    emit('update', {
      defaultValue: v
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    })
    return
  }
  if (props.fieldType === 'NUMBER') {
    const num = Number(v)
    emit('update', { defaultValue: Number.isNaN(num) ? undefined : num })
    return
  }
  emit('update', { defaultValue: v })
}

function onDefaultBool(v: string | number | boolean) {
  emit('update', { defaultValue: Boolean(v) })
}
</script>

<template>
  <div v-if="defaultMode === 'bool'" class="row row--inline">
    <label class="row__label">{{ t('form.defaultValue') }}</label>
    <el-select
      :model-value="defaultValue === undefined ? '' : String(defaultValue)"
      clearable
      style="width: 120px"
      @update:model-value="(v: string) => onDefaultBool(v === 'true')"
    >
      <el-option :label="t('common.on')" value="true" />
      <el-option :label="t('common.off')" value="false" />
    </el-select>
  </div>
  <div v-else class="row">
    <label class="row__label">{{ t('form.defaultValue') }}</label>
    <el-input
      :model-value="defaultText"
      :placeholder="
        defaultMode === 'array'
          ? t('form.arrayDefaultPlaceholder')
          : t('form.createDefaultPlaceholder')
      "
      @update:model-value="onDefaultText"
    />
  </div>
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

.row__label {
  display: block;
  margin-bottom: var(--sw-space-4);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-regular);
}

.row--inline .row__label {
  margin-bottom: 0;
}
</style>

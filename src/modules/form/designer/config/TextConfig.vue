<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 单行文本（TEXT）类型专属配置。
 * P53：组件名称/宽度/占位/必填/字段标识已上收 FieldConfigPanel 通用三段，
 * 本组件只保留类型专属的「最大长度」行。
 */
import type { TextField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'

const props = defineProps<{ field: TextField; otherNames: string[]; hideLength?: boolean }>()
const emit = defineEmits<{ update: [patch: FieldPatch] }>()
</script>

<template>
  <div>
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

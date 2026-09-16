<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * DatasourceConfig — I2 DATASOURCE 字段配置面板。
 * 编辑 dsBinding 稳定标识（queryKey/version/valueField/displayField）。
 * SQL/密钥只存服务端契约注册表；绑定存在性由服务端发布门校验。
 */
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import type { DatasourceField, FormSchemaField } from '@/contracts/form-schema'

const props = defineProps<{
  field: FormSchemaField
  /** 同表单内**其它**字段的列名（重名校验用）。 */
  otherNames: string[]
}>()

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

function binding(): DatasourceField['dsBinding'] {
  return (
    (props.field as DatasourceField).dsBinding ?? { queryKey: '', valueField: '', displayField: '' }
  )
}

function patchBinding(part: Partial<DatasourceField['dsBinding']>) {
  emit('update', { dsBinding: { ...binding(), ...part } })
}

function onVersion(value: string) {
  const n = Number(value)
  patchBinding({ version: value !== '' && Number.isInteger(n) ? n : undefined })
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
    @update="(p) => emit('update', p)"
  />

  <div class="row">
    <label class="row__label">{{ t('form.queryContractKeyLabel') }}</label>
    <el-input
      :model-value="binding().queryKey"
      :placeholder="t('form.queryKeyPlaceholder')"
      @update:model-value="(v: string) => patchBinding({ queryKey: v })"
    />
  </div>
  <div class="row">
    <label class="row__label">{{ t('form.contractVersionLabel') }}</label>
    <el-input
      :model-value="binding().version === undefined ? '' : String(binding().version)"
      :placeholder="t('form.contractVersionPlaceholder')"
      @update:model-value="onVersion"
    />
  </div>
  <div class="row">
    <label class="row__label">{{ t('form.valueFieldLabel') }}</label>
    <el-input
      :model-value="binding().valueField"
      :placeholder="t('form.valueFieldPlaceholder')"
      @update:model-value="(v: string) => patchBinding({ valueField: v })"
    />
  </div>
  <div class="row">
    <label class="row__label">{{ t('form.displayFieldLabel') }}</label>
    <el-input
      :model-value="binding().displayField"
      :placeholder="t('form.displayFieldPlaceholder')"
      @update:model-value="(v: string) => patchBinding({ displayField: v })"
    />
  </div>
  <p class="row__hint">
    {{ t('form.datasourceValueNote') }}
  </p>
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
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}
</style>

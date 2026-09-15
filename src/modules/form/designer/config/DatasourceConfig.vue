<script setup lang="ts">
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
    <label class="row__label">查询契约 queryKey</label>
    <el-input
      :model-value="binding().queryKey"
      placeholder="如：vendor_options（管理员登记的版本化契约）"
      @update:model-value="(v: string) => patchBinding({ queryKey: v })"
    />
  </div>
  <div class="row">
    <label class="row__label">契约版本（留空 = 启用版本）</label>
    <el-input
      :model-value="binding().version === undefined ? '' : String(binding().version)"
      placeholder="如：1"
      @update:model-value="onVersion"
    />
  </div>
  <div class="row">
    <label class="row__label">值字段（稳定业务 ID 列）</label>
    <el-input
      :model-value="binding().valueField"
      placeholder="如：vendor_id"
      @update:model-value="(v: string) => patchBinding({ valueField: v })"
    />
  </div>
  <div class="row">
    <label class="row__label">显示字段列</label>
    <el-input
      :model-value="binding().displayField"
      placeholder="如：vendor_name"
      @update:model-value="(v: string) => patchBinding({ displayField: v })"
    />
  </div>
  <p class="row__hint">
    填报值 = 稳定对象标识；正式提交由服务端按契约解析并冻结 value/display，伪造或越权对象会被拒绝。
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

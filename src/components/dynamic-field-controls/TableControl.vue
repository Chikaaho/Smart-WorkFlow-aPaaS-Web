<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 子表格（TABLE）控件：内嵌子表，可增删行。
 * 行操作（addRow/removeRow/updateCell）为本组件内部逻辑，行数据外部进（modelValue
 * 数组）、整表经 emit 出；子表单元格按子字段 type 查同一注册表渲染
 * （getSubFieldComponent：REFERENCE 降级占位 / TABLE 不递归 / 未知类型兜底）。
 * 只读语义：隐藏「操作」表头、删除与添加行按钮（子控件 disabled 语义由各控件自行承担）。
 */
import { computed } from 'vue'
import type { TableField } from '@/contracts/form-schema'
import { getSubFieldComponent } from '../dynamic-field-subfield'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

type Row = Record<string, unknown> & {
  _rowAction?: 'ADD' | 'UPDATE' | 'DELETE' | 'UNCHANGED'
  _rowId?: string
}

const tableRows = computed<Row[]>(() => {
  const v = props.modelValue
  return Array.isArray(v) ? (v as Row[]) : []
})

/** 画布设计态：无行操作；空数据渲染 2 行示例空行（仅外观，不进 modelValue）。 */
const isDesign = computed(() => props.design === true)
const showActions = computed(() => !props.readonly && !isDesign.value)
const sampleRows = computed(() =>
  isDesign.value && tableRows.value.length === 0 && subFields.value.length > 0 ? [0, 1] : [],
)

/** subFields 仅在 TABLE 判别子下存在（本组件只承载 TABLE 字段）。 */
const subFields = computed(() =>
  props.field.type === 'TABLE' ? (props.field as TableField).subFields : [],
)

function addRow() {
  if (props.field.type !== 'TABLE') return
  const row: Row = { _rowAction: 'ADD' }
  for (const sf of subFields.value) row[sf.name] = ''
  emit('update:modelValue', [...tableRows.value, row])
}

function removeRow(idx: number) {
  const rows = [...tableRows.value]
  const row = rows[idx] as Row
  if (row._rowAction === 'ADD') {
    rows.splice(idx, 1)
  } else {
    rows[idx] = { ...row, _rowAction: 'DELETE' as const }
  }
  emit('update:modelValue', rows)
}

function updateCell(rowIdx: number, subName: string, value: unknown) {
  emit(
    'update:modelValue',
    tableRows.value.map((r, i) => {
      if (i !== rowIdx) return r
      const row = r as Row
      const nextAction: Row['_rowAction'] =
        row._rowAction === 'UNCHANGED' ? 'UPDATE' : (row._rowAction ?? 'ADD')
      return { ...row, [subName]: value, _rowAction: nextAction }
    }),
  )
}
</script>

<template>
  <div
    class="dynamic-field__table"
    :class="{
      'dynamic-field__table--readonly': readonly,
      'dynamic-field__table--design': isDesign,
    }"
  >
    <table class="dynamic-field__table-inner">
      <thead>
        <tr>
          <th v-for="sf in subFields" :key="sf.name">{{ sf.label || sf.name }}</th>
          <th v-if="showActions">{{ t('common.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, rowIdx) in tableRows" :key="rowIdx">
          <tr v-if="(row as Row)._rowAction !== 'DELETE'">
            <td v-for="sf in subFields" :key="sf.name">
              <component
                :is="getSubFieldComponent(sf.type)"
                :field="sf"
                :model-value="tableRows[rowIdx]?.[sf.name] ?? ''"
                :readonly="readonly"
                :sub-field="true"
                :form-key="formKey"
                :record-id="recordId"
                @update:model-value="updateCell(rowIdx, sf.name, $event)"
              />
            </td>
            <td v-if="showActions">
              <el-button size="small" type="danger" @click="removeRow(rowIdx)">{{
                t('common.delete')
              }}</el-button>
            </td>
          </tr>
        </template>
        <tr v-for="n in sampleRows" :key="`design-sample-${n}`" class="dynamic-field__table-sample">
          <td v-for="sf in subFields" :key="sf.name">&nbsp;</td>
        </tr>
      </tbody>
    </table>
    <el-button v-if="!readonly && !isDesign" size="small" @click="addRow">{{
      t('component.addRow')
    }}</el-button>
  </div>
</template>

<style scoped>
/* ── 内嵌子表（视觉值仅引用 --sw-* token，零硬编码 px/hex） ── */
.dynamic-field__table {
  width: 100%;
}

.dynamic-field__table-inner {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: var(--sw-space-8);
  border: 1px solid var(--sw-border-base);
}

.dynamic-field__table-inner th,
.dynamic-field__table-inner td {
  padding: var(--sw-space-4) var(--sw-space-8);
  text-align: center;
  border: 1px solid var(--sw-border-light);
}

.dynamic-field__table-inner th {
  font-size: var(--sw-font-caption);
  font-weight: var(--sw-font-weight-caption);
  background: var(--sw-fill-base);
}
.dynamic-field__table--readonly .dynamic-field__table-inner {
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  margin-bottom: 0;
  border: 1px solid var(--sw-border-light);
}
.dynamic-field__table--readonly th,
.dynamic-field__table--readonly td {
  box-sizing: border-box;
  height: 38px;
  padding: 7px 12px;
  border: 0;
  border-right: 1px solid var(--sw-border-light);
  text-align: left;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  overflow-wrap: anywhere;
}
.dynamic-field__table--readonly th {
  color: var(--sw-text-secondary);
  background: var(--sw-fill-base);
  font-size: 12px;
  line-height: 18px;
}
.dynamic-field__table--readonly th:last-child,
.dynamic-field__table--readonly td:last-child {
  border-right: 0;
}
.dynamic-field__table--readonly th,
.dynamic-field__table--readonly tbody tr:not(:last-child) td {
  border-bottom: 1px solid var(--sw-border-light);
}
.dynamic-field__table--design .dynamic-field__table-sample td {
  height: 36px;
  background: var(--sw-fill-base);
}
</style>

<script setup lang="ts">
/**
 * DesignerFieldStatesPanel — BF20261013-013 节点「字段属性」页签：
 * 该节点对每个表单字段的必填/编辑/隐藏三态（自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import { useI18n } from '@/locales'
import type { Ref, ComputedRef } from 'vue'

const { t } = useI18n()

/** 字段三态面板绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerFieldStatesPanelApi {
  /** 字段搜索关键字（仅过滤列表，不改变权限绑定）。 */
  fieldPermKeyword: Ref<string>
  /** 搜索过滤后的主表单字段。 */
  fieldPermVisibleFields: ComputedRef<Array<{ name: string; type: string; label?: string }>>
  /** 读取字段三态（结合节点已存 fieldStates 与 required 缺省）。 */
  fieldStateOf: (field: { name: string; required?: boolean }) => {
    required: boolean
    editable: boolean
    hidden: boolean
  }
  /** 三态变更写回节点配置。 */
  onFieldStateChange: (
    field: { name: string; required?: boolean },
    key: 'required' | 'editable' | 'hidden',
    value: unknown,
  ) => void
  /** 版本预览态（只读快照，禁用编辑）。 */
  isVersionPreview: ComputedRef<boolean>
}

const props = defineProps<{
  api: DesignerFieldStatesPanelApi
}>()

const {
  fieldPermKeyword,
  fieldPermVisibleFields,
  fieldStateOf,
  onFieldStateChange,
  isVersionPreview,
} = props.api
</script>

<template>
  <el-input
    v-model="fieldPermKeyword"
    class="field-states__search"
    :placeholder="t('workflow.fieldStatesSearchPlaceholder')"
    clearable
    :inert="isVersionPreview"
  />
  <table v-if="fieldPermVisibleFields.length" class="field-states__table" :inert="isVersionPreview">
    <thead>
      <tr>
        <th>{{ t('workflow.fieldStatesFieldName') }}</th>
        <th>{{ t('workflow.fieldStatesRequired') }}</th>
        <th>{{ t('workflow.fieldStatesEditable') }}</th>
        <th>{{ t('workflow.fieldStatesHidden') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="f in fieldPermVisibleFields" :key="f.name">
        <td class="field-states__name">{{ f.label || f.name }}</td>
        <td>
          <el-checkbox
            :model-value="fieldStateOf(f).required"
            @update:model-value="(v: unknown) => onFieldStateChange(f, 'required', v)"
          />
        </td>
        <td>
          <el-checkbox
            :model-value="fieldStateOf(f).editable"
            @update:model-value="(v: unknown) => onFieldStateChange(f, 'editable', v)"
          />
        </td>
        <td>
          <el-checkbox
            :model-value="fieldStateOf(f).hidden"
            @update:model-value="(v: unknown) => onFieldStateChange(f, 'hidden', v)"
          />
        </td>
      </tr>
    </tbody>
  </table>
  <p v-else class="field-states__empty">{{ t('workflow.fieldStatesEmptyHint') }}</p>
</template>

<style scoped>
.field-states__search {
  margin-bottom: 8px;
}
.field-states__search :deep(.el-input__wrapper) {
  box-sizing: border-box;
  height: 32px;
}
.field-states__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.field-states__table :deep(.el-checkbox__inner) {
  width: 18px !important;
  height: 18px !important;
}
.field-states__table :deep(.el-checkbox__inner::after) {
  left: 6px;
  top: 2px;
}
.field-states__table th,
.field-states__table td {
  padding: 6px 4px;
  border-bottom: 1px solid #eef1f8;
  text-align: left;
  vertical-align: middle;
}
.field-states__table th {
  color: #8795ad;
  font-weight: 500;
  white-space: nowrap;
}
.field-states__name {
  color: #19233b;
}
.field-states__empty {
  margin: 12px 0 0;
  color: #99a5bb;
  font-size: 12px;
}
</style>

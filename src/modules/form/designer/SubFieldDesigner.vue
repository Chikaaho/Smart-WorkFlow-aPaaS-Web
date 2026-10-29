<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import FieldConfigPanel from './FieldConfigPanel.vue'
import { applyFieldPatch, type FieldPatch } from './field-config'
import { itemsToSubFields, subFieldsToItems, type AllowedSubFieldType } from './subfield-convert'
import { nextDesignerItemId, type DesignerItem } from './types'
import type { TableSubField } from '@/contracts/form-schema'

const props = withDefaults(
  defineProps<{
    tableLabel: string
    subFields: readonly TableSubField[]
    readonly?: boolean
  }>(),
  { readonly: false },
)

const emit = defineEmits<{
  close: [subFields: TableSubField[]]
}>()

const { t } = useI18n()
const working = ref<TableSubField[]>(props.subFields.map(cloneSubField))
const configVisible = ref(false)
const editingIndex = ref<number | null>(null)
const configItem = ref<DesignerItem | null>(null)
const configTitle = computed(() => {
  if (!configItem.value) return t('form.subFieldConfigure')
  const action = editingIndex.value === -1 ? t('form.subFieldAdd') : t('form.subFieldConfigure')
  return `${action} · ${configItem.value.field.label || configItem.value.field.name}`
})

const TYPE_LABELS: Record<AllowedSubFieldType, string> = {
  TEXT: 'fieldTypeText',
  RICH_TEXT: 'fieldTypeRichText',
  NUMBER: 'fieldTypeNumber',
  DATE: 'fieldTypeDate',
  BOOL: 'fieldTypeSwitch',
  DICT: 'fieldTypeDict',
  USER: 'fieldTypeUser',
  DEPT: 'fieldTypeDept',
}

const otherNames = computed(() =>
  working.value.filter((_, index) => index !== editingIndex.value).map((field) => field.name),
)

function cloneSubField(field: TableSubField): TableSubField {
  return JSON.parse(JSON.stringify(field)) as TableSubField
}

function typeLabel(field: TableSubField): string {
  if (!(field.type in TYPE_LABELS)) return field.type
  return t(`form.${TYPE_LABELS[field.type as AllowedSubFieldType]}`)
}

function typeLabelRow(raw: unknown): string {
  return typeLabel(raw as TableSubField)
}

function uniqueName(): string {
  const names = new Set(working.value.map((field) => field.name))
  let index = working.value.length + 1
  while (names.has(`field_${index}`)) index += 1
  return `field_${index}`
}

function openAdd(): void {
  if (props.readonly) return
  const name = uniqueName()
  configItem.value = {
    id: nextDesignerItemId(),
    field: {
      name,
      type: 'TEXT',
      label: t('form.fieldDefaultLabel', { count: working.value.length + 1 }),
      required: false,
    },
  }
  editingIndex.value = -1
  configVisible.value = true
}

function openConfig(index: number): void {
  if (props.readonly) return
  const [item] = subFieldsToItems([working.value[index]])
  configItem.value = item ?? null
  editingIndex.value = index
  configVisible.value = Boolean(item)
}

function patchConfig(patch: FieldPatch): void {
  if (configItem.value) applyFieldPatch(configItem.value.field, patch)
}

function saveConfig(): void {
  if (!configItem.value) return
  const field = itemsToSubFields([configItem.value])[0]
  if (!field) {
    ElMessage.warning(t('form.subFieldTypeInvalid'))
    return
  }
  const name = field.name.trim()
  if (!name) {
    ElMessage.warning(t('form.fieldNameRequired'))
    return
  }
  if (otherNames.value.includes(name)) {
    ElMessage.warning(t('form.fieldNameDuplicate'))
    return
  }
  field.name = name
  if (editingIndex.value === -1) working.value.push(field)
  else if (editingIndex.value !== null) working.value.splice(editingIndex.value, 1, field)
  configVisible.value = false
  configItem.value = null
  editingIndex.value = null
}

function cancelConfig(): void {
  configVisible.value = false
  configItem.value = null
  editingIndex.value = null
}

function moveField(index: number, offset: number): void {
  if (props.readonly) return
  const next = index + offset
  if (next < 0 || next >= working.value.length) return
  const [field] = working.value.splice(index, 1)
  if (field) working.value.splice(next, 0, field)
}

async function removeField(index: number): Promise<void> {
  if (props.readonly) return
  const field = working.value[index]
  if (!field) return
  try {
    await ElMessageBox.confirm(
      t('form.subFieldDeleteConfirm', { name: field.label || field.name }),
      t('form.subFieldDeleteTitle'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      },
    )
  } catch {
    return
  }
  working.value.splice(index, 1)
}

function confirmFields(): void {
  emit('close', working.value.map(cloneSubField))
}

function cancel(): void {
  emit('close', props.subFields.map(cloneSubField))
}
</script>

<template>
  <el-dialog
    :model-value="true"
    append-to-body
    class="subfield-dialog"
    align-center
    width="1120px"
    :close-on-click-modal="false"
    :show-close="true"
    @update:model-value="(value: boolean) => !value && cancel()"
  >
    <template #header>
      <h2 class="subfield-dialog__title">{{ t('form.subFieldEditorTitle', { tableLabel }) }}</h2>
    </template>

    <div class="subfield-dialog__toolbar">
      <span class="subfield-dialog__table-label">{{ tableLabel }}</span>
      <span class="subfield-dialog__count">{{
        t('form.subFieldCountLabel', { count: working.length })
      }}</span>
      <el-button class="subfield-dialog__add" type="primary" :disabled="readonly" @click="openAdd">
        {{ t('form.subFieldAdd') }}
      </el-button>
    </div>

    <el-table :data="working" max-height="560">
      <el-table-column :label="t('form.subFieldName')" min-width="560">
        <template #default="{ row }">
          <div class="subfield-dialog__name">
            <strong>{{ row.label || row.name }}</strong>
            <span>{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('form.subFieldComponent')" min-width="260">
        <template #default="{ row }">{{ typeLabelRow(row) }}</template>
      </el-table-column>
      <el-table-column :label="t('form.subFieldRequired')" min-width="130">
        <template #default="{ row }">{{
          row.required ? t('common.yes') : t('common.no')
        }}</template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" min-width="120">
        <template #default="{ $index }">
          <el-button
            link
            :icon="ArrowUp"
            :disabled="readonly || $index === 0"
            :aria-label="t('form.moveUp')"
            @click="moveField($index, -1)"
          />
          <el-button
            link
            :icon="ArrowDown"
            :disabled="readonly || $index === working.length - 1"
            :aria-label="t('form.moveDown')"
            @click="moveField($index, 1)"
          />
          <el-button link type="primary" :disabled="readonly" @click="openConfig($index)">
            {{ t('form.subFieldConfigure') }}
          </el-button>
          <el-button
            link
            type="danger"
            :icon="Delete"
            :disabled="readonly"
            :aria-label="t('common.delete')"
            @click="removeField($index)"
          />
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirmFields">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="configVisible"
    append-to-body
    class="subfield-config-dialog"
    width="760px"
    :title="configTitle"
    :close-on-click-modal="false"
  >
    <FieldConfigPanel
      :field="configItem"
      :other-names="otherNames"
      :readonly="readonly"
      :subfield="true"
      @update="patchConfig"
    />
    <template #footer>
      <el-button @click="cancelConfig">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="saveConfig">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.subfield-dialog__title {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: 600;
}
.subfield-dialog__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.subfield-dialog__table-label {
  color: var(--sw-text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}
.subfield-dialog__count {
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 20px;
}
.subfield-dialog__add {
  width: 80px;
  margin-left: auto;
  padding: 0 8px;
}
.subfield-dialog__name {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
}
.subfield-dialog__name strong {
  font-weight: 500;
}
.subfield-dialog__name span {
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
}
</style>

<style>
.subfield-dialog.el-dialog,
.subfield-config-dialog.el-dialog {
  --el-dialog-padding-primary: 0px;
  border-radius: var(--sw-radius-card);
  padding: 0;
}
/* 273:1396（执行提示13）：正文/表 x425..1495（w1070）、标题 x425、取消 x1327/确定 x1415。 */
.subfield-dialog .el-dialog__header {
  padding: 28px 25px 12px;
}
.subfield-dialog .el-dialog__title,
.subfield-dialog .subfield-dialog__title {
  padding: 0;
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--sw-text-primary, #1f2a44);
}
.subfield-dialog .el-table .cell {
  white-space: nowrap;
}
.subfield-dialog .el-table__cell .el-button + .el-button {
  margin-left: 6px;
}
/* 273:1396：标题独立、工具行、表头42/行45、左右内距24、右下 80×32。 */
.subfield-dialog .el-dialog__body {
  padding: 0 25px 4px;
}
.subfield-dialog .el-table th.el-table__cell {
  height: 42px;
  background: #f5f7fb;
}
.subfield-dialog .el-table th.el-table__cell > .cell {
  text-align: left;
}
.subfield-dialog .el-table td.el-table__cell > .cell {
  text-align: left;
}
/* 273:1396（执行提示14）：首列文字与原图约 443 左锚（表 x425 + 18） */
.subfield-dialog .el-table .el-table__cell:first-child .cell {
  padding-left: 18px;
}
/* 273:1396（执行提示15）：tbody 组件类型/必填值文字较原图偏右 8px——仅这两列正文内距 -8（表头/首列/操作区不动） */
.subfield-dialog .el-table tbody .el-table__cell:nth-child(2) .cell,
.subfield-dialog .el-table tbody .el-table__cell:nth-child(3) .cell {
  padding-left: 4px;
}
.subfield-dialog .el-table td.el-table__cell {
  height: 45px;
}
.subfield-dialog .el-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 25px 20px;
}
.subfield-dialog .el-dialog__footer .el-button {
  width: 80px;
  height: 32px;
  margin: 0;
}
.subfield-config-dialog .el-dialog__body {
  max-height: min(660px, calc(100vh - 180px));
  overflow: auto;
}
</style>

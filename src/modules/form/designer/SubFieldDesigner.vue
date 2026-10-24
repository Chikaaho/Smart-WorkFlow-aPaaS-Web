<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDown, ArrowUp, Delete, Plus } from '@element-plus/icons-vue'
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
    width="1120px"
    :close-on-click-modal="false"
    :show-close="true"
    @update:model-value="(value: boolean) => !value && cancel()"
  >
    <template #header>
      <div class="subfield-dialog__head">
        <div>
          <h2>{{ t('form.subFieldEditorTitle', { tableLabel }) }}</h2>
          <p>{{ t('form.subFieldCountLabel', { count: working.length }) }}</p>
        </div>
        <el-button type="primary" :icon="Plus" :disabled="readonly" @click="openAdd">
          {{ t('form.subFieldAdd') }}
        </el-button>
      </div>
    </template>

    <el-table :data="working" max-height="560">
      <el-table-column :label="t('form.subFieldName')" min-width="240">
        <template #default="{ row }">
          <div class="subfield-dialog__name">
            <strong>{{ row.label || row.name }}</strong>
            <span>{{ row.name }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('form.subFieldComponent')" min-width="150">
        <template #default="{ row }">{{ typeLabelRow(row) }}</template>
      </el-table-column>
      <el-table-column :label="t('form.subFieldRequired')" width="110" align="center">
        <template #default="{ row }">{{
          row.required ? t('common.yes') : t('common.no')
        }}</template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="260" align="right">
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
.subfield-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-16);
}
.subfield-dialog__head h2 {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: 600;
}
.subfield-dialog__head p {
  margin: var(--sw-space-4) 0 0;
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-secondary);
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
  border-radius: var(--sw-radius-card);
}
.subfield-dialog .el-dialog__body {
  padding-top: var(--sw-space-8);
}
.subfield-config-dialog .el-dialog__body {
  max-height: min(660px, calc(100vh - 180px));
  overflow: auto;
}
</style>

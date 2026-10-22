<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@/locales'
import { usePermission } from '@/foundation/permission'
import type { FormSchema, FormSchemaField, FieldPermissionRule } from '@/contracts/form-schema'
import FormListConfigEditor from './FormListConfigEditor.vue'
import DatasourceManagerDialog from './DatasourceManagerDialog.vue'

const { t } = useI18n()
const { hasPerm } = usePermission()
const datasourceDialogVisible = ref(false)
const canManageDatasources = hasPerm('workflow:datasource:manage')

const props = defineProps<{
  formId: string | null
  fields: FormSchemaField[]
  fieldPermissions: NonNullable<FormSchema['fieldPermissions']>
  actionPermissions: NonNullable<FormSchema['actionPermissions']>
}>()

const emit = defineEmits<{
  'update:fieldPermissions': [value: NonNullable<FormSchema['fieldPermissions']>]
  'update:actionPermissions': [value: NonNullable<FormSchema['actionPermissions']>]
}>()

interface PermissionRow {
  key: string
  label: string
  kind: string
}

const actions = [
  ['view', 'form.actionView'],
  ['create', 'form.actionCreate'],
  ['edit', 'form.actionEdit'],
  ['delete', 'form.actionDelete'],
  ['export', 'form.actionExport'],
  ['import', 'form.actionImport'],
  ['flowStart', 'form.actionFlowStart'],
] as const

const rows = computed<PermissionRow[]>(() =>
  props.fields.flatMap((field) => {
    const base = {
      key: field.name,
      label: field.label || field.name,
      kind: field.type,
    }
    if (field.type !== 'TABLE') return [base]
    return [
      base,
      ...field.subFields.map((sub) => ({
        key: `${field.name}.${sub.name}`,
        label: `${field.label || field.name} / ${sub.label || sub.name}`,
        kind: sub.type,
      })),
    ]
  }),
)

function subjects(key: string, action: 'view' | 'edit'): string[] {
  return props.fieldPermissions[key]?.[action] ?? []
}

function actionSubjects(action: string): string[] {
  return props.actionPermissions[action] ?? []
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function patchField(key: string, action: 'view' | 'edit', values: string[]) {
  const next = clonePlain(props.fieldPermissions)
  const rule: FieldPermissionRule = { ...(next[key] ?? {}) }
  const normalized = values.map((item) => item.trim()).filter(Boolean)
  if (normalized.length) rule[action] = [...new Set(normalized)]
  else delete rule[action]
  if (rule.view?.length || rule.edit?.length) next[key] = rule
  else delete next[key]
  emit('update:fieldPermissions', next)
}

function patchAction(action: string, values: string[]) {
  const next = clonePlain(props.actionPermissions)
  const normalized = values.map((item) => item.trim()).filter(Boolean)
  if (normalized.length) next[action] = [...new Set(normalized)]
  else delete next[action]
  emit('update:actionPermissions', next)
}

function resetPermissions() {
  emit('update:fieldPermissions', {})
  emit('update:actionPermissions', {})
}
</script>

<template>
  <section class="access-panel">
    <header class="access-panel__header">
      <div>
        <h2>{{ t('form.permissionTitle') }}</h2>
        <p>{{ t('form.permissionHint') }}</p>
      </div>
      <div class="access-panel__actions">
        <el-button v-if="canManageDatasources" @click="datasourceDialogVisible = true">
          {{ t('form.manageDatasources') }}
        </el-button>
        <el-button @click="resetPermissions">{{ t('form.resetPermissions') }}</el-button>
      </div>
    </header>

    <article class="access-card">
      <h3>{{ t('form.fieldAccess') }}</h3>
      <p class="access-card__hint">{{ t('form.permissionSubjectHint') }}</p>
      <el-table :data="rows" max-height="420">
        <el-table-column prop="label" :label="t('form.field')" min-width="240" />
        <el-table-column prop="kind" :label="t('form.dataType')" width="130" />
        <el-table-column :label="t('form.viewPermission')" min-width="280">
          <template #default="{ row }">
            <el-select
              :model-value="subjects(row.key, 'view')"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              :placeholder="t('form.noLimit')"
              @update:model-value="(value: string[]) => patchField(row.key, 'view', value)"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('form.editPermission')" min-width="280">
          <template #default="{ row }">
            <el-select
              :model-value="subjects(row.key, 'edit')"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              :placeholder="t('form.noLimit')"
              @update:model-value="(value: string[]) => patchField(row.key, 'edit', value)"
            />
          </template>
        </el-table-column>
      </el-table>
    </article>

    <article class="access-card">
      <h3>{{ t('form.actionAccess') }}</h3>
      <p class="access-card__hint">{{ t('form.actionPermissionHint') }}</p>
      <div class="action-grid">
        <label v-for="[key, label] in actions" :key="key" class="action-row">
          <span>{{ t(label) }}</span>
          <el-select
            :model-value="actionSubjects(key)"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            :placeholder="t('form.noLimit')"
            @update:model-value="(value: string[]) => patchAction(key, value)"
          />
        </label>
      </div>
    </article>

    <FormListConfigEditor :form-id="formId" :fields="fields" />
    <DatasourceManagerDialog v-if="canManageDatasources" v-model="datasourceDialogVisible" />
  </section>
</template>

<style scoped>
.access-panel {
  box-sizing: border-box;
  height: 100%;
  padding: var(--sw-space-20) var(--sw-space-24);
  overflow: auto;
  background: var(--sw-fill-page);
}
.access-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sw-space-24);
  margin-bottom: var(--sw-space-16);
}
.access-panel__header h2,
.access-card h3 {
  margin: 0;
  color: var(--sw-text-primary);
}
.access-panel__actions {
  display: flex;
  gap: var(--sw-space-8);
}
.access-panel__header h2 {
  font-size: var(--sw-font-h2);
  line-height: var(--sw-space-24);
}
.access-panel__header p,
.access-card__hint {
  margin: var(--sw-space-4) 0 0;
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
  line-height: var(--sw-space-20);
}
.access-card {
  padding: var(--sw-space-20);
  margin-bottom: var(--sw-space-16);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: var(--sw-fill-base);
}
.access-card h3 {
  font-size: var(--sw-font-h2);
}
.access-card__hint {
  margin-bottom: var(--sw-space-12);
}
.access-card :deep(.el-select) {
  width: 100%;
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sw-space-12) var(--sw-space-20);
}
.action-row {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
  align-items: center;
  gap: var(--sw-space-12);
  color: var(--sw-text-regular);
  font-size: var(--sw-font-body);
}
@media (max-width: 900px) {
  .action-grid {
    grid-template-columns: 1fr;
  }
}
</style>

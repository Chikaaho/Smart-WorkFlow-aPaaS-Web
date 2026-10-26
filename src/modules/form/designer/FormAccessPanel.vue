<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/locales'
import HintTip from '@/components/HintTip.vue'
import { usePermission } from '@/foundation/permission'
import type { FormSchema, FormSchemaField, FieldPermissionRule } from '@/contracts/form-schema'
import { ApiError } from '@/foundation/request'
import { listFormIntegrationCandidates, type FormIntegrationCandidate } from '../api/form'
import FormListConfigEditor from './FormListConfigEditor.vue'
import DatasourceManagerDialog from './DatasourceManagerDialog.vue'

const { t } = useI18n()
const { hasPerm } = usePermission()
const datasourceDialogVisible = ref(false)
const canManageDatasources = hasPerm('workflow:datasource:manage')
/** 候选读取沿用既有外部工具查看权限；配置表单不自动授予该权限。 */
const canViewIntegrationCandidates = hasPerm('agent:tool:view')

const props = defineProps<{
  formId: string | null
  fields: FormSchemaField[]
  fieldPermissions: NonNullable<FormSchema['fieldPermissions']>
  actionPermissions: NonNullable<FormSchema['actionPermissions']>
  allowedIntegrations?: string[]
}>()

const emit = defineEmits<{
  'update:fieldPermissions': [value: NonNullable<FormSchema['fieldPermissions']>]
  'update:actionPermissions': [value: NonNullable<FormSchema['actionPermissions']>]
  'update:allowedIntegrations': [value: string[]]
}>()

const integrationCandidates = ref<FormIntegrationCandidate[]>([])
const integrationLoading = ref(false)
const integrationError = ref('')
const selectedIntegrations = computed(() => props.allowedIntegrations ?? [])
const unavailableIntegrations = computed(() => {
  if (integrationError.value || !integrationCandidates.value.length) return []
  const known = new Set(integrationCandidates.value.map((candidate) => candidate.name))
  return selectedIntegrations.value.filter((id) => !known.has(id))
})

function integrationScopeLabel(scope: string): string {
  return scope === 'WRITE' ? t('form.integrationScopeWrite') : t('form.integrationScopeQuery')
}

async function loadIntegrationCandidates() {
  if (!canViewIntegrationCandidates) return
  integrationLoading.value = true
  integrationError.value = ''
  try {
    integrationCandidates.value = await listFormIntegrationCandidates()
  } catch (err) {
    integrationCandidates.value = []
    integrationError.value =
      err instanceof ApiError && err.msg ? err.msg : t('form.integrationCandidatesFailed')
  } finally {
    integrationLoading.value = false
  }
}

function patchIntegrations(values: string[]) {
  const normalized = values.map((item) => item.trim()).filter(Boolean)
  emit('update:allowedIntegrations', [...new Set(normalized)])
}

onMounted(() => {
  void loadIntegrationCandidates()
})

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
  emit('update:allowedIntegrations', [])
}
</script>

<template>
  <section class="access-panel">
    <header class="access-panel__header">
      <div>
        <h2>{{ t('form.permissionTitle') }} <HintTip :content="t('form.permissionHint')" /></h2>
      </div>
      <div class="access-panel__actions">
        <el-button v-if="canManageDatasources" @click="datasourceDialogVisible = true">
          {{ t('form.manageDatasources') }}
        </el-button>
        <el-button @click="resetPermissions">{{ t('form.resetPermissions') }}</el-button>
      </div>
    </header>

    <article class="access-card">
      <h3>{{ t('form.fieldAccess') }} <HintTip :content="t('form.permissionSubjectHint')" /></h3>
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
      <h3>{{ t('form.actionAccess') }} <HintTip :content="t('form.actionPermissionHint')" /></h3>
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

    <article class="access-card" data-testid="form-integration-access">
      <h3>
        {{ t('form.integrationTitle') }}
        <HintTip :content="t('form.integrationHint')" />
      </h3>
      <el-alert
        v-if="!canViewIntegrationCandidates"
        :title="t('form.integrationNoToolPermission')"
        type="info"
        :closable="false"
        show-icon
      />
      <el-alert
        v-else-if="integrationError"
        :title="integrationError"
        type="warning"
        :closable="false"
        show-icon
      />
      <template v-else>
        <div class="integration-row">
          <el-select
            :model-value="selectedIntegrations"
            multiple
            filterable
            clearable
            :loading="integrationLoading"
            :placeholder="t('form.integrationPlaceholder')"
            @update:model-value="(value: string[]) => patchIntegrations(value)"
          >
            <el-option
              v-for="candidate in integrationCandidates"
              :key="candidate.name"
              :label="`${candidate.name} · ${integrationScopeLabel(candidate.effectScope)}`"
              :value="candidate.name"
            >
              <span>{{ candidate.name }} · {{ integrationScopeLabel(candidate.effectScope) }}</span>
              <span class="integration-option__hint">{{ candidate.description }}</span>
            </el-option>
          </el-select>
          <el-button :disabled="integrationLoading" @click="loadIntegrationCandidates">
            {{ t('form.integrationRefresh') }}
          </el-button>
        </div>
        <p v-if="!integrationLoading && !integrationCandidates.length" class="integration-note">
          {{ t('form.integrationCandidatesEmpty') }}
        </p>
        <p class="integration-note">{{ t('form.integrationScopeNote') }}</p>
        <p v-if="unavailableIntegrations.length" class="integration-warning">
          {{ t('form.integrationUnavailable', { ids: unavailableIntegrations.join('、') }) }}
        </p>
      </template>
      <div
        v-if="!canViewIntegrationCandidates && selectedIntegrations.length"
        class="integration-selected"
      >
        <el-tag v-for="id in selectedIntegrations" :key="id" size="small">{{ id }}</el-tag>
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
.integration-row {
  display: flex;
  align-items: center;
  gap: var(--sw-space-12);
}
.integration-row :deep(.el-select) {
  flex: 1;
}
.integration-option__hint {
  margin-left: var(--sw-space-12);
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
}
.integration-note,
.integration-warning,
.integration-selected {
  margin: var(--sw-space-8) 0 0;
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}
.integration-warning {
  color: var(--sw-danger);
}
.integration-selected {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sw-space-8);
}
@media (max-width: 900px) {
  .action-grid {
    grid-template-columns: 1fr;
  }
}
</style>

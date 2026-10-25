<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DetailDialog from '@/components/DetailDialog.vue'
import { parseDefinition } from '@/adapters/form-designer'
import FormPreview from '@/adapters/form-designer/FormPreview.vue'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import {
  loadSnapshotProcessVersionCandidates,
  loadSnapshotProcessVersionGraph,
  type SnapshotProcessVersionCandidate,
} from '@/adapters/published-snapshot'
import type { FormSchema } from '@/contracts/form-schema'
import { useI18n } from '@/locales'
import {
  getFormSnapshotDefinition,
  type FormSnapshotDTO,
  type FormSnapshotDetailDTO,
} from '../api/form-def'
import {
  buildSnapshotAdvancedConfigs,
  buildSnapshotApprovalScripts,
  buildSnapshotConstraints,
  buildSnapshotFieldPermissions,
  buildSnapshotNodes,
  buildSnapshotScripts,
  buildSnapshotTriggers,
  buildSnapshotVariables,
  buildSnapshotVisibility,
  extractSnapshotListConfig,
  flattenSnapshotFields,
  matchesSnapshotFormVersion,
  type SnapshotProcessSource,
  type SnapshotScriptKind,
  type SnapshotScriptView,
} from './published-snapshot'

/**
 * PublishedSnapshotViewer — one read-only surface for a frozen form + workflow version.
 *
 * The form snapshot is authoritative for the form definition. Related process
 * definitions are found through the adapter seam, then only versions whose
 * formVersion matches the selected form snapshot are loaded from the immutable
 * workflow version endpoint. Missing data is displayed as missing; current
 * mutable configuration is never substituted for a frozen value.
 */

const props = defineProps<{
  formId: string
  formKey: string
  snapshot: FormSnapshotDTO | null
}>()
const visible = defineModel<boolean>('visible', { required: true })
const { t } = useI18n()

type SectionKey =
  | 'overview'
  | 'fields'
  | 'design'
  | 'scripts'
  | 'validation'
  | 'visibility'
  | 'columns'
  | 'permissions'
  | 'nodes'
  | 'variables'
  | 'triggers'
  | 'approvalScripts'

const loading = ref(false)
const loadError = ref('')
const warnings = ref<string[]>([])
const detail = ref<FormSnapshotDetailDTO | null>(null)
const schema = ref<FormSchema | null>(null)
const rawDefinition = ref<Record<string, unknown> | null>(null)
const processSources = ref<SnapshotProcessSource[]>([])
const activeSection = ref<SectionKey>('overview')
let requestGeneration = 0

const fields = computed(() => (schema.value ? flattenSnapshotFields(schema.value) : []))
const constraints = computed(() => buildSnapshotConstraints(fields.value))
const visibility = computed(() => (schema.value ? buildSnapshotVisibility(schema.value) : []))
const permissions = computed(() =>
  schema.value ? buildSnapshotFieldPermissions(schema.value) : [],
)
const actionPermissions = computed(() =>
  Object.entries(schema.value?.actionPermissions ?? {}).map(([action, subjects]) => ({
    action,
    subjects,
  })),
)
const listConfig = computed(() =>
  rawDefinition.value ? extractSnapshotListConfig(rawDefinition.value) : null,
)
const nodes = computed(() => buildSnapshotNodes(processSources.value))
const advancedConfigs = computed(() => buildSnapshotAdvancedConfigs(processSources.value))
const variables = computed(() => buildSnapshotVariables(processSources.value))
const triggers = computed(() => buildSnapshotTriggers(processSources.value))
const scripts = computed(() =>
  schema.value ? buildSnapshotScripts(schema.value, processSources.value) : [],
)
const approvalScripts = computed(() => buildSnapshotApprovalScripts(processSources.value))

type SnapshotConstraintRow = ReturnType<typeof buildSnapshotConstraints>[number]
const scriptDetailVisible = ref(false)
const scriptDetailTitle = ref('')
const scriptDetailCode = ref('')
const scriptDetailMeta = ref('')
const validationDetailVisible = ref(false)
const validationDetailTitle = ref('')
const validationDetailRow = ref<SnapshotConstraintRow | null>(null)

function openScriptDetail(row: SnapshotScriptView): void {
  scriptDetailTitle.value = `${row.label} · ${scriptKindLabel(row.kind)}`
  scriptDetailCode.value = row.code
  const meta = [
    scriptSourceLabel(row),
    row.event ? eventLabel(row.event) : '',
    row.nodeKey ?? '',
    row.enabled == null
      ? ''
      : row.enabled
        ? t('form.snapshotViewer.enabled')
        : t('form.snapshotViewer.disabled'),
  ].filter(Boolean)
  scriptDetailMeta.value = meta.join(' · ')
  scriptDetailVisible.value = true
}

function openValidationDetail(row: SnapshotConstraintRow): void {
  validationDetailTitle.value = `${row.label} · ${validationLabel(row.kind)}`
  validationDetailRow.value = row
  validationDetailVisible.value = true
}

const effectiveSnapshot = computed<FormSnapshotDTO | null>(() => {
  if (!props.snapshot) return null
  return { ...props.snapshot, ...(detail.value ?? {}) }
})
const snapshotVersionText = computed(() => {
  const snapshot = effectiveSnapshot.value
  if (!snapshot) return '—'
  return String(snapshot.versionLabel || snapshot.formVersion)
})
const snapshotTitle = computed(
  () => schema.value?.title?.trim() || effectiveSnapshot.value?.versionLabel || props.formKey,
)
const rawDefinitionText = computed(() =>
  rawDefinition.value ? prettyJson(rawDefinition.value) : '',
)

const sections = computed(
  () =>
    [
      ['overview', 'overview', processSources.value.length],
      ['fields', 'fields', fields.value.length],
      ['design', 'design', fields.value.length],
      ['scripts', 'scripts', scripts.value.length],
      ['validation', 'validation', constraints.value.length],
      ['visibility', 'visibility', visibility.value.length],
      ['columns', 'columns', listConfig.value?.columns.length ?? 0],
      ['permissions', 'permissions', permissions.value.length + actionPermissions.value.length],
      ['nodes', 'nodes', nodes.value.length],
      ['variables', 'variables', variables.value.length],
      ['triggers', 'triggers', triggers.value.length],
      ['approvalScripts', 'approvalScripts', approvalScripts.value.length],
    ].map(([key, label, count]) => ({ key, label, count })) as Array<{
      key: SectionKey
      label: string
      count: number
    }>,
)

function sectionLabel(label: string): string {
  return t(`form.snapshotViewer.${label}`)
}

function selectSection(key: SectionKey): void {
  activeSection.value = key
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseRawDefinition(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('snapshot definition must be an object')
  }
  return parsed as Record<string, unknown>
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'msg' in error) {
    const message = (error as { msg?: unknown }).msg
    if (typeof message === 'string' && message.trim()) return message
  }
  return error instanceof Error ? error.message : String(error)
}

function toProcessSource(
  candidate: SnapshotProcessVersionCandidate,
  graph: unknown,
): SnapshotProcessSource {
  return {
    defId: String(candidate.def.id),
    defName: candidate.def.name || candidate.def.processKey,
    processKey: candidate.def.processKey,
    graphVersion: candidate.version.graphVersion,
    versionName: candidate.version.name || candidate.def.name,
    status: candidate.version.status,
    formVersion: candidate.version.formVersion,
    publishedAt: candidate.version.publishedAt || candidate.version.updateTime,
    publisherName: candidate.version.publisherName,
    graph,
  }
}

async function loadRelatedProcessSnapshots(
  generation: number,
  snapshot: FormSnapshotDTO,
): Promise<void> {
  try {
    const candidates = await loadSnapshotProcessVersionCandidates(props.formKey)
    if (generation !== requestGeneration) return
    warnings.value.push(...candidates.failures)
    const matches = candidates.items.filter((candidate) =>
      matchesSnapshotFormVersion(
        snapshot.formVersion,
        snapshot.versionLabel,
        candidate.version.formVersion,
      ),
    )
    const settled = await Promise.allSettled(
      matches.map(async (candidate) => ({
        candidate,
        graph: await loadSnapshotProcessVersionGraph(
          candidate.def.id,
          candidate.version.graphVersion,
        ),
      })),
    )
    if (generation !== requestGeneration) return
    const sources: SnapshotProcessSource[] = []
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sources.push(toProcessSource(result.value.candidate, result.value.graph))
        return
      }
      const candidate = matches[index]
      warnings.value.push(
        t('form.snapshotViewer.processReadFailed', {
          name: candidate?.def.name ?? candidate?.def.processKey ?? 'process',
          message: errorText(result.reason),
        }),
      )
    })
    processSources.value = sources.sort(
      (left, right) =>
        left.defName.localeCompare(right.defName) || left.graphVersion - right.graphVersion,
    )
  } catch (error) {
    if (generation === requestGeneration) {
      warnings.value.push(t('form.snapshotViewer.processLoadFailed', { message: errorText(error) }))
    }
  }
}

async function loadSnapshot(): Promise<void> {
  const snapshot = props.snapshot
  if (!visible.value || !snapshot) return
  const generation = ++requestGeneration
  loading.value = true
  loadError.value = ''
  warnings.value = []
  detail.value = null
  schema.value = null
  rawDefinition.value = null
  processSources.value = []
  activeSection.value = 'overview'
  try {
    const loaded = await getFormSnapshotDefinition(props.formId, snapshot.formVersion)
    if (generation !== requestGeneration) return
    const raw = parseRawDefinition(loaded.definition)
    const parsed = parseDefinition(loaded.definition)
    detail.value = loaded
    rawDefinition.value = raw
    schema.value = parsed
    await loadRelatedProcessSnapshots(generation, snapshot)
  } catch (error) {
    if (generation === requestGeneration) {
      loadError.value = `${t('form.snapshotViewer.loadFailed')}: ${errorText(error)}`
    }
  } finally {
    if (generation === requestGeneration) loading.value = false
  }
}

function principalText(values: string[] | undefined): string {
  return values?.length ? values.join('、') : t('form.snapshotViewer.unrestricted')
}

function validationLabel(kind: string): string {
  const keys: Record<string, string> = {
    required: 'constraintRequired',
    minLength: 'constraintMinLength',
    maxLength: 'constraintMaxLength',
    pattern: 'constraintPattern',
    patternMessage: 'constraintPatternMessage',
  }
  return t(`form.snapshotViewer.${keys[kind] ?? 'rawValue'}`)
}

function scriptKindLabel(kind: SnapshotScriptKind): string {
  return t(`form.snapshotViewer.scriptKind.${kind}`)
}

function scriptSourceLabel(row: SnapshotScriptView): string {
  if (row.source === 'FORM_FIELD') return t('form.snapshotViewer.formFieldSource')
  if (row.source === 'FORM_EVENT') return t('form.snapshotViewer.formEventSource')
  return row.source
}

function eventLabel(event: string | undefined): string {
  if (!event) return '—'
  return t(`form.snapshotViewer.event.${event}`, event)
}

watch(
  () => [visible.value, props.formId, props.formKey, props.snapshot?.formVersion] as const,
  () => {
    if (visible.value) void loadSnapshot()
  },
  { immediate: true },
)
</script>

<template>
  <DetailDialog
    v-model="visible"
    class="published-snapshot-dialog"
    :title="t('form.snapshotViewer.title')"
    :loading="loading"
    :error="loadError"
    width="min(1440px, calc(100vw - 32px))"
    appearance="design"
    :show-footer="false"
    append-to-body
  >
    <div v-if="loading" class="snapshot-loading">{{ t('form.snapshotViewer.loading') }}</div>
    <div
      v-else-if="effectiveSnapshot && schema"
      class="snapshot-viewer"
      data-testid="published-snapshot-viewer"
    >
      <header class="snapshot-heading">
        <div class="snapshot-heading__identity">
          <span class="snapshot-heading__eyebrow">{{ t('form.snapshotViewer.frozenBadge') }}</span>
          <h2>{{ snapshotTitle }}</h2>
          <p>{{ t('form.snapshotViewer.subtitle') }}</p>
        </div>
        <div class="snapshot-heading__version">
          <span>{{ t('form.snapshotViewer.version') }}</span>
          <strong>v{{ snapshotVersionText }}</strong>
        </div>
      </header>

      <div v-if="warnings.length" class="snapshot-warning" role="status">
        <p v-for="warning in warnings" :key="warning">{{ warning }}</p>
      </div>

      <div class="snapshot-layout">
        <nav class="snapshot-nav" :aria-label="t('form.snapshotViewer.sections')">
          <button
            v-for="section in sections"
            :key="section.key"
            type="button"
            class="snapshot-nav__item"
            :class="{ 'is-active': activeSection === section.key }"
            :aria-current="activeSection === section.key ? 'page' : undefined"
            @click="selectSection(section.key)"
          >
            <span>{{ sectionLabel(section.label) }}</span>
            <b>{{ section.count }}</b>
          </button>
        </nav>

        <main class="snapshot-main">
          <section v-if="activeSection === 'overview'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('overview') }}</h3>
              </div>
            </div>
            <dl class="snapshot-meta">
              <div>
                <dt>{{ t('form.snapshotViewer.formIdentity') }}</dt>
                <dd>
                  <code>{{ formKey }}</code>
                </dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.version') }}</dt>
                <dd>v{{ snapshotVersionText }}</dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.publishedAt') }}</dt>
                <dd>{{ effectiveSnapshot.createTime || '—' }}</dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.status') }}</dt>
                <dd>{{ effectiveSnapshot.status || '—' }}</dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.author') }}</dt>
                <dd>{{ effectiveSnapshot.author || '—' }}</dd>
              </div>
              <div>
                <dt>{{ t('form.snapshotViewer.schemaVersion') }}</dt>
                <dd>{{ schema.schemaVersion ?? '—' }}</dd>
              </div>
              <div class="snapshot-meta__wide">
                <dt>{{ t('form.snapshotViewer.note') }}</dt>
                <dd>{{ effectiveSnapshot.note || '—' }}</dd>
              </div>
            </dl>

            <h4>{{ t('form.snapshotViewer.processSnapshots') }}</h4>
            <p v-if="processSources.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noMatchingProcess') }}
            </p>
            <div v-else class="snapshot-process-list">
              <article
                v-for="process in processSources"
                :key="`${process.defId}:${process.graphVersion}`"
                class="snapshot-process"
              >
                <div>
                  <strong>{{ process.defName }}</strong>
                  <span>{{ process.processKey }} · v{{ process.graphVersion }}</span>
                </div>
                <div class="snapshot-process__meta">
                  <span>{{ process.status }}</span>
                  <span>{{ process.publishedAt || '—' }}</span>
                  <span>{{ process.publisherName || '—' }}</span>
                </div>
                <details class="snapshot-raw snapshot-raw--card">
                  <summary>{{ t('form.snapshotViewer.rawProcessGraph') }}</summary>
                  <pre>{{ prettyJson(process.graph) }}</pre>
                </details>
              </article>
            </div>

            <details class="snapshot-raw">
              <summary>{{ t('form.snapshotViewer.rawDefinition') }}</summary>
              <pre>{{ rawDefinitionText }}</pre>
            </details>
          </section>

          <section v-else-if="activeSection === 'fields'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('fields') }}</h3>
              </div>
            </div>
            <p v-if="fields.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <table v-else class="snapshot-table">
              <thead>
                <tr>
                  <th>{{ t('form.snapshotViewer.fieldPath') }}</th>
                  <th>{{ t('form.snapshotViewer.label') }}</th>
                  <th>{{ t('form.snapshotViewer.type') }}</th>
                  <th>{{ t('form.snapshotViewer.required') }}</th>
                  <th>{{ t('form.snapshotViewer.width') }}</th>
                  <th>{{ t('form.snapshotViewer.description') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in fields" :key="field.key">
                  <td>
                    <code>{{ field.path }}</code>
                    <small v-if="field.table === 'subtable'">{{ field.parentLabel }}</small>
                  </td>
                  <td>{{ field.label }}</td>
                  <td>
                    <code>{{ field.type }}</code>
                  </td>
                  <td>{{ field.required ? t('common.yes') : t('common.no') }}</td>
                  <td>{{ field.width ?? '—' }}</td>
                  <td>
                    {{ field.description || '—' }}
                    <details class="snapshot-raw snapshot-raw--inline">
                      <summary>{{ t('form.snapshotViewer.rawConfig') }}</summary>
                      <pre>{{ prettyJson(field.field) }}</pre>
                    </details>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-else-if="activeSection === 'design'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('design') }}</h3>
              </div>
            </div>
            <p v-if="!schema || schema.fields.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <div v-else class="snapshot-design">
              <p v-if="schema.description" class="snapshot-design__description">
                {{ schema.description }}
              </p>
              <div class="snapshot-design__grid">
                <div
                  v-for="field in schema.fields"
                  :key="field.name"
                  :style="{ gridColumn: `span ${getFormFieldColSpan(field)}` }"
                >
                  <FormPreview :schema="{ title: '', fields: [field] }" mode="design" />
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'scripts'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('scripts') }}</h3>
              </div>
            </div>
            <p v-if="scripts.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <template v-else>
              <article v-for="row in scripts" :key="row.key" class="snapshot-code-card">
                <header>
                  <strong>{{ row.label }}</strong>
                  <span>{{ scriptKindLabel(row.kind) }}</span>
                  <span>{{ scriptSourceLabel(row) }}</span>
                  <span v-if="row.event">{{ eventLabel(row.event) }}</span>
                  <span v-if="row.nodeKey">{{ row.nodeKey }}</span>
                  <span v-if="row.enabled != null">
                    {{
                      row.enabled
                        ? t('form.snapshotViewer.enabled')
                        : t('form.snapshotViewer.disabled')
                    }}
                  </span>
                  <el-button link type="primary" size="small" @click="openScriptDetail(row)">
                    {{ t('common.view') }}
                  </el-button>
                </header>
                <pre>{{ row.code }}</pre>
              </article>
            </template>
          </section>

          <section v-else-if="activeSection === 'validation'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('validation') }}</h3>
              </div>
            </div>
            <p v-if="constraints.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <table v-else class="snapshot-table">
              <thead>
                <tr>
                  <th>{{ t('form.snapshotViewer.fieldPath') }}</th>
                  <th>{{ t('form.snapshotViewer.label') }}</th>
                  <th>{{ t('form.snapshotViewer.rule') }}</th>
                  <th>{{ t('form.snapshotViewer.value') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in constraints" :key="`${row.path}:${row.kind}`">
                  <td>
                    <code>{{ row.path }}</code>
                  </td>
                  <td>{{ row.label }}</td>
                  <td>{{ validationLabel(row.kind) }}</td>
                  <td>
                    <code>{{ row.value }}</code>
                    <el-button link type="primary" size="small" @click="openValidationDetail(row)">
                      {{ t('common.view') }}
                    </el-button>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-else-if="activeSection === 'visibility'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('visibility') }}</h3>
              </div>
            </div>
            <p v-if="visibility.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <template v-else>
              <article v-for="rule in visibility" :key="rule.target" class="snapshot-rule">
                <header>
                  <strong>{{ rule.targetLabel }}</strong
                  ><code>{{ rule.target }}</code
                  ><span>{{ rule.logic }}</span>
                </header>
                <ul>
                  <li
                    v-for="(condition, index) in rule.conditions"
                    :key="`${condition.field}:${index}`"
                  >
                    <strong>{{ condition.label }}</strong>
                    <code>{{ condition.field }}</code> {{ condition.op }}
                    <code v-if="condition.value != null">{{ condition.value }}</code>
                  </li>
                </ul>
              </article>
            </template>
          </section>

          <section v-else-if="activeSection === 'columns'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('columns') }}</h3>
              </div>
            </div>
            <p v-if="!listConfig" class="snapshot-limitation">
              {{ t('form.snapshotViewer.listConfigMissing') }}
            </p>
            <template v-else>
              <p v-if="listConfig.columns.length === 0" class="snapshot-empty">
                {{ t('form.snapshotViewer.noData') }}
              </p>
              <table v-else class="snapshot-table">
                <thead>
                  <tr>
                    <th>{{ t('form.snapshotViewer.fieldPath') }}</th>
                    <th>{{ t('form.snapshotViewer.label') }}</th>
                    <th>{{ t('form.snapshotViewer.width') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="column in listConfig.columns" :key="column.name">
                    <td>
                      <code>{{ column.name }}</code>
                    </td>
                    <td>{{ column.label || '—' }}</td>
                    <td>{{ column.width ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <dl class="snapshot-meta snapshot-meta--compact">
                <div>
                  <dt>{{ t('form.snapshotViewer.filters') }}</dt>
                  <dd>
                    {{
                      listConfig.filters.map((item) => `${item.name} ${item.op}`).join('、') || '—'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t('form.snapshotViewer.defaultSort') }}</dt>
                  <dd>
                    {{
                      listConfig.defaultSort
                        ? `${listConfig.defaultSort.name} ${listConfig.defaultSort.desc ? 'DESC' : 'ASC'}`
                        : '—'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>{{ t('form.snapshotViewer.actions') }}</dt>
                  <dd>{{ listConfig.actions.join('、') || '—' }}</dd>
                </div>
              </dl>
              <details class="snapshot-raw">
                <summary>{{ t('form.snapshotViewer.rawConfig') }}</summary>
                <pre>{{ prettyJson(listConfig.raw) }}</pre>
              </details>
            </template>
          </section>

          <section v-else-if="activeSection === 'permissions'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('permissions') }}</h3>
              </div>
            </div>
            <p v-if="permissions.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noFieldPermissions') }}
            </p>
            <table v-else class="snapshot-table">
              <thead>
                <tr>
                  <th>{{ t('form.snapshotViewer.fieldPath') }}</th>
                  <th>{{ t('form.snapshotViewer.label') }}</th>
                  <th>{{ t('form.snapshotViewer.viewPrincipals') }}</th>
                  <th>{{ t('form.snapshotViewer.editPrincipals') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in permissions" :key="row.field">
                  <td>
                    <code>{{ row.field }}</code>
                  </td>
                  <td>{{ row.label }}</td>
                  <td>{{ principalText(row.rule.view) }}</td>
                  <td>{{ principalText(row.rule.edit) }}</td>
                </tr>
              </tbody>
            </table>
            <h4>{{ t('form.snapshotViewer.actionPermissions') }}</h4>
            <p v-if="actionPermissions.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <ul v-else class="snapshot-principal-list">
              <li v-for="row in actionPermissions" :key="row.action">
                <code>{{ row.action }}</code
                ><span>{{ principalText(row.subjects) }}</span>
              </li>
            </ul>
          </section>

          <section v-else-if="activeSection === 'nodes'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('nodes') }}</h3>
              </div>
            </div>
            <p v-if="nodes.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <div v-else class="snapshot-node-list">
              <article
                v-for="node in nodes"
                :key="`${node.processKey}:${node.graphVersion}:${node.id}`"
                class="snapshot-node"
              >
                <header>
                  <strong>{{ node.name }}</strong
                  ><code>{{ node.id }}</code
                  ><span>{{ node.type }}</span>
                </header>
                <p>{{ node.processName }} · v{{ node.graphVersion }}</p>
                <details class="snapshot-raw">
                  <summary>{{ t('form.snapshotViewer.rawConfig') }}</summary>
                  <pre>{{ prettyJson(node.config) }}</pre>
                </details>
              </article>
            </div>
            <h4>{{ t('form.snapshotViewer.advancedConfig') }}</h4>
            <p v-if="advancedConfigs.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <template v-else>
              <details
                v-for="row in advancedConfigs"
                :key="`${row.processKey}:${row.graphVersion}`"
                class="snapshot-raw snapshot-raw--card"
              >
                <summary>{{ row.processName }} · v{{ row.graphVersion }}</summary>
                <pre>{{ prettyJson(row.config) }}</pre>
              </details>
            </template>
          </section>

          <section v-else-if="activeSection === 'variables'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('variables') }}</h3>
              </div>
            </div>
            <p v-if="variables.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <table v-else class="snapshot-table">
              <thead>
                <tr>
                  <th>{{ t('form.snapshotViewer.version') }}</th>
                  <th>{{ t('form.snapshotViewer.variableId') }}</th>
                  <th>{{ t('form.snapshotViewer.label') }}</th>
                  <th>{{ t('form.snapshotViewer.type') }}</th>
                  <th>{{ t('form.snapshotViewer.source') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in variables"
                  :key="`${row.processKey}:${row.graphVersion}:${row.variable.varId}`"
                >
                  <td>{{ row.processName }} · v{{ row.graphVersion }}</td>
                  <td>
                    <code>{{ row.variable.varId }}</code>
                  </td>
                  <td>{{ row.variable.name }}</td>
                  <td>{{ row.variable.type }}</td>
                  <td>{{ row.variable.source }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-else-if="activeSection === 'triggers'" class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('triggers') }}</h3>
              </div>
            </div>
            <p v-if="triggers.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <template v-else>
              <article
                v-for="row in triggers"
                :key="`${row.processKey}:${row.graphVersion}:${row.trigger.triggerId}`"
                class="snapshot-code-card"
              >
                <header>
                  <strong>{{ row.trigger.name || row.trigger.triggerId }}</strong
                  ><span>{{ row.processName }} · v{{ row.graphVersion }}</span
                  ><span>{{ eventLabel(row.trigger.event) }}</span
                  ><span>{{
                    row.trigger.enabled === false
                      ? t('form.snapshotViewer.disabled')
                      : t('form.snapshotViewer.enabled')
                  }}</span>
                </header>
                <pre>{{ row.trigger.script || '—' }}</pre>
                <details class="snapshot-raw">
                  <summary>{{ t('form.snapshotViewer.rawConfig') }}</summary>
                  <pre>{{ prettyJson(row.trigger) }}</pre>
                </details>
              </article>
            </template>
          </section>

          <section v-else class="snapshot-section">
            <div class="snapshot-section__head">
              <div>
                <h3>{{ sectionLabel('approvalScripts') }}</h3>
              </div>
            </div>
            <p v-if="approvalScripts.length === 0" class="snapshot-empty">
              {{ t('form.snapshotViewer.noData') }}
            </p>
            <template v-else>
              <article v-for="row in approvalScripts" :key="row.key" class="snapshot-code-card">
                <header>
                  <strong>{{ row.label }}</strong
                  ><span>{{ scriptKindLabel(row.kind) }}</span
                  ><span>{{ row.nodeKey || '—' }}</span
                  ><span>{{ eventLabel(row.event) }}</span
                  ><span v-if="row.enabled != null">{{
                    row.enabled
                      ? t('form.snapshotViewer.enabled')
                      : t('form.snapshotViewer.disabled')
                  }}</span>
                </header>
                <pre>{{ row.code }}</pre>
              </article>
            </template>
          </section>
        </main>
      </div>
    </div>

    <DetailDialog
      v-model="scriptDetailVisible"
      :title="scriptDetailTitle"
      width="640px"
      :show-footer="false"
      append-to-body
    >
      <p v-if="scriptDetailMeta" class="snapshot-dialog-meta">{{ scriptDetailMeta }}</p>
      <pre class="snapshot-dialog-code">{{ scriptDetailCode }}</pre>
    </DetailDialog>

    <DetailDialog
      v-model="validationDetailVisible"
      :title="validationDetailTitle"
      width="520px"
      :show-footer="false"
      append-to-body
    >
      <p v-if="validationDetailRow" class="snapshot-dialog-meta">
        <code>{{ validationDetailRow.path }}</code>
      </p>
      <pre class="snapshot-dialog-code">{{ validationDetailRow?.value }}</pre>
    </DetailDialog>
  </DetailDialog>
</template>

<style scoped>
.snapshot-loading {
  display: grid;
  min-height: 360px;
  place-items: center;
  color: var(--sw-text-secondary);
  font-size: 14px;
}

.snapshot-viewer {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
  height: clamp(520px, 68vh, 760px);
  min-height: 0;
}

.snapshot-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sw-space-24);
  padding: var(--sw-space-20) var(--sw-space-24);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: var(--sw-surface-card);
}

.snapshot-heading h2 {
  margin: 4px 0 6px;
  color: var(--sw-text-primary);
  font-size: 22px;
  line-height: 30px;
}

.snapshot-heading p {
  margin: 0;
  color: var(--sw-text-secondary);
  font-size: 13px;
}

.snapshot-heading__eyebrow {
  color: var(--sw-color-primary);
  font-size: 12px;
  font-weight: 600;
}

.snapshot-heading__version {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-heading__version strong {
  color: var(--sw-color-primary);
  font-size: 22px;
  line-height: 28px;
}

.snapshot-warning {
  padding: 10px 14px;
  border: 1px solid var(--sw-warning);
  border-radius: var(--sw-radius-base);
  background: var(--sw-warning-bg);
  color: var(--sw-text-primary);
  font-size: 12px;
}

.snapshot-warning p {
  margin: 0;
}

.snapshot-warning p + p {
  margin-top: 4px;
}

.snapshot-layout {
  display: grid;
  flex: 1;
  grid-template-columns: 190px minmax(0, 1fr);
  min-height: 0;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: var(--sw-surface-card);
  overflow: hidden;
}

.snapshot-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--sw-space-12);
  border-right: 1px solid var(--sw-border-light);
  background: var(--sw-fill-base);
}

.snapshot-nav__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-text-regular);
  text-align: left;
  cursor: pointer;
}

.snapshot-nav__item:hover {
  background: var(--sw-color-primary-soft);
}

.snapshot-nav__item.is-active {
  background: var(--sw-color-primary);
  color: var(--sw-surface-card);
}

.snapshot-nav__item b {
  min-width: 24px;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  font-size: 11px;
  font-weight: 500;
  text-align: center;
}

.snapshot-main {
  min-width: 0;
  overflow-y: auto;
  padding: var(--sw-space-20);
}

.snapshot-section {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

.snapshot-section__head h3 {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
}

.snapshot-design {
  padding: var(--sw-space-20) var(--sw-space-24);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: var(--sw-fill-base);
}

.snapshot-design__description {
  margin: 0 0 var(--sw-space-12);
  color: var(--sw-text-regular);
  font-size: var(--sw-font-secondary);
  line-height: 1.6;
}

.snapshot-design__grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: var(--sw-form-row-gap);
}

.snapshot-dialog-meta {
  margin: 0 0 12px;
  color: var(--sw-text-secondary);
  font-size: 13px;
}

.snapshot-dialog-code {
  margin: 0;
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
  color: var(--sw-text-primary);
  font-family: var(--sw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.snapshot-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.snapshot-meta > div {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-page);
}

.snapshot-meta__wide {
  grid-column: 1 / -1;
}

.snapshot-meta dt {
  margin-bottom: 5px;
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-meta dd {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.snapshot-meta--compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.snapshot-process-list {
  display: grid;
  gap: 10px;
}

.snapshot-process {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
}

.snapshot-process > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.snapshot-process span {
  color: var(--sw-text-secondary);
  font-size: 12px;
}

.snapshot-process__meta {
  align-items: flex-end;
  text-align: right;
}

.snapshot-process > .snapshot-raw {
  flex: 1 0 100%;
}

.snapshot-empty,
.snapshot-limitation {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

.snapshot-limitation {
  border-color: var(--sw-warning);
  background: var(--sw-warning-bg);
  color: var(--sw-text-primary);
}

.snapshot-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}

.snapshot-table th,
.snapshot-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--sw-border-light);
  color: var(--sw-text-regular);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.snapshot-table th {
  background: var(--sw-fill-base);
  color: var(--sw-text-secondary);
  font-weight: 500;
}

.snapshot-table code,
.snapshot-node code,
.snapshot-rule code {
  color: var(--sw-color-primary);
  font-family: var(--el-font-family-mono, monospace);
}

.snapshot-table small {
  display: block;
  margin-top: 3px;
  color: var(--sw-text-secondary);
}

.snapshot-code-card,
.snapshot-rule,
.snapshot-node {
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  overflow: hidden;
}

.snapshot-code-card header,
.snapshot-rule header,
.snapshot-node header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--sw-fill-base);
}

.snapshot-code-card header span,
.snapshot-rule header span,
.snapshot-node header span {
  color: var(--sw-text-secondary);
  font-size: 11px;
}

.snapshot-code-card pre,
.snapshot-raw pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--sw-text-primary);
  font: 12px/1.65 var(--el-font-family-mono, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--sw-surface-page);
}

.snapshot-code-card details pre {
  border-top: 1px solid var(--sw-border-light);
}

.snapshot-rule ul {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin: 0;
  padding: 12px;
  list-style: none;
  color: var(--sw-text-regular);
  font-size: 12px;
}

.snapshot-node-list {
  display: grid;
  gap: 10px;
}

.snapshot-node > p {
  margin: 0;
  padding: 8px 12px;
  color: var(--sw-text-secondary);
  font-size: 11px;
}

.snapshot-raw {
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-page);
}

.snapshot-raw summary {
  padding: 9px 12px;
  color: var(--sw-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.snapshot-raw--inline {
  margin-top: 6px;
}

.snapshot-raw--inline summary,
.snapshot-raw--card summary {
  padding: 7px 9px;
}

.snapshot-raw--card {
  margin-bottom: 8px;
}

.snapshot-principal-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.snapshot-principal-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-regular);
  font-size: 12px;
}

:global(.published-snapshot-dialog .sw-detail-dialog__body) {
  min-height: 0;
}

@media (max-width: 900px) {
  .snapshot-viewer {
    height: auto;
    max-height: 76vh;
  }

  .snapshot-heading,
  .snapshot-process {
    flex-direction: column;
    align-items: flex-start;
  }

  .snapshot-heading__version,
  .snapshot-process__meta {
    align-items: flex-start;
    text-align: left;
  }

  .snapshot-layout {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .snapshot-nav {
    flex-direction: row;
    flex-wrap: wrap;
    border-right: none;
    border-bottom: 1px solid var(--sw-border-light);
  }

  .snapshot-main {
    max-height: 58vh;
  }

  .snapshot-meta,
  .snapshot-meta--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

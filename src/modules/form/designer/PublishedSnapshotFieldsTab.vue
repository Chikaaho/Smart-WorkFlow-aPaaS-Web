<script setup lang="ts">
import { useI18n } from '@/locales'
import type { FormSchema } from '@/contracts/form-schema'
import type { FormSnapshotDTO } from '../api/form-def'
import type {
  SnapshotConstraintView,
  SnapshotFieldPermissionView,
  SnapshotFieldView,
  SnapshotListConfigView,
  SnapshotScriptView,
  SnapshotVisibilityView,
} from './published-snapshot'
import {
  prettyJson,
  snapshotComponentLabel,
  snapshotStorageLabel,
  snapshotWidthText,
  useSnapshotLabels,
} from './use-snapshot-labels'

/** 字段清单页签：单一冻结字段表 + 概览/原始定义/校验/显隐/脚本/列配置/权限的只读承接。 */
defineProps<{
  fields: SnapshotFieldView[]
  formKey: string
  snapshotVersionText: string
  effectiveSnapshot: FormSnapshotDTO | null
  schema: FormSchema | null
  rawDefinitionText: string
  constraints: SnapshotConstraintView[]
  visibility: SnapshotVisibilityView[]
  scripts: SnapshotScriptView[]
  listConfig: SnapshotListConfigView | null
  permissions: SnapshotFieldPermissionView[]
  actionPermissions: Array<{ action: string; subjects: string[] }>
}>()

const emit = defineEmits<{
  'open-field-props': [path: string]
  'open-validation-rule': [row: SnapshotConstraintView]
  'open-script-detail': [row: SnapshotScriptView]
}>()

const { t } = useI18n()
const {
  sectionLabel,
  principalText,
  validationLabel,
  scriptKindLabel,
  scriptSourceLabel,
  eventLabel,
} = useSnapshotLabels()
</script>

<template>
  <!-- ═══ 字段清单（审查23 S14-F）：主面单一冻结字段表；概览/原始定义收独立详情入口 ═══ -->
  <div class="snapshot-tabbody snapshot-tabbody--full">
    <!-- 审查23 S14-F：字段表从页签下 20 起，34 表头 / 46 行 -->
    <section class="snapshot-section snapshot-fields-section">
      <p v-if="fields.length === 0" class="snapshot-empty">
        {{ t('form.snapshotViewer.noData') }}
      </p>
      <table v-else class="snapshot-table snapshot-fields-table">
        <thead>
          <tr>
            <th>{{ t('fieldList.colName') }}</th>
            <th>{{ t('fieldList.colComponent') }}</th>
            <th>{{ t('fieldList.colKey') }}</th>
            <th>{{ t('fieldList.colType') }}</th>
            <th>{{ t('form.snapshotViewer.width') }}</th>
            <th>{{ t('form.snapshotViewer.required') }}</th>
            <th>{{ t('common.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="field in fields" :key="field.key">
            <td>
              {{ field.label || '—' }}
              <small v-if="field.table === 'subtable'">{{ field.parentLabel }}</small>
            </td>
            <td>{{ snapshotComponentLabel(field.field) }}</td>
            <td>
              <code>{{ field.path }}</code>
            </td>
            <td>{{ snapshotStorageLabel(field.type) }}</td>
            <td>{{ snapshotWidthText(field.width) }}</td>
            <td>{{ field.required ? t('common.yes') : t('common.no') }}</td>
            <td>
              <el-button
                link
                type="primary"
                size="small"
                @click="emit('open-field-props', field.path)"
              >
                {{ t('form.snapshotViewer.viewProps') }}
              </el-button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <details class="snapshot-raw snapshot-raw--card">
      <summary>{{ sectionLabel('overview') }}</summary>
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
          <dd>{{ effectiveSnapshot?.createTime || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('form.snapshotViewer.status') }}</dt>
          <dd>{{ effectiveSnapshot?.status || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('form.snapshotViewer.author') }}</dt>
          <dd>{{ effectiveSnapshot?.author || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('form.snapshotViewer.schemaVersion') }}</dt>
          <dd>{{ schema?.schemaVersion ?? '—' }}</dd>
        </div>
        <div class="snapshot-meta__wide">
          <dt>{{ t('form.snapshotViewer.note') }}</dt>
          <dd>{{ effectiveSnapshot?.note || '—' }}</dd>
        </div>
      </dl>
      <details class="snapshot-raw">
        <summary>{{ t('form.snapshotViewer.rawDefinition') }}</summary>
        <pre>{{ rawDefinitionText }}</pre>
      </details>
    </details>

    <!-- 审查27 S14-F：校验/显隐/脚本收可达折叠详情，不连续撑长主面 -->
    <details class="snapshot-fields-secondary">
      <summary>{{ sectionLabel('validation') }}</summary>
      <section class="snapshot-section">
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
                <el-button
                  link
                  type="primary"
                  size="small"
                  @click="emit('open-validation-rule', row)"
                >
                  {{ t('common.view') }}
                </el-button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </details>

    <details class="snapshot-fields-secondary">
      <summary>{{ sectionLabel('visibility') }}</summary>
      <section class="snapshot-section">
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
    </details>

    <details class="snapshot-fields-secondary">
      <summary>{{ sectionLabel('scripts') }}</summary>
      <section class="snapshot-section">
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
                  row.enabled ? t('form.snapshotViewer.enabled') : t('form.snapshotViewer.disabled')
                }}
              </span>
              <el-button link type="primary" size="small" @click="emit('open-script-detail', row)">
                {{ t('common.view') }}
              </el-button>
            </header>
            <pre>{{ row.code }}</pre>
          </article>
        </template>
      </section>
    </details>

    <section class="snapshot-section">
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
              {{ listConfig.filters.map((item) => `${item.name} ${item.op}`).join('、') || '—' }}
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

    <section class="snapshot-section">
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
  </div>
</template>

<style scoped>
.snapshot-tabbody--full {
  box-sizing: border-box;
  padding: 20px 24px 24px;
  overflow-y: auto;
}

.snapshot-section {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

.snapshot-section + .snapshot-section {
  margin-top: var(--sw-space-24);
}

.snapshot-section__head h3 {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
}

.snapshot-fields-section {
  margin-top: 0;
}
/* 审查27 S14-F：44/44（border-box，抵消基础 9px 上下内距） */
.snapshot-fields-table th {
  box-sizing: border-box;
  height: 44px;
}
.snapshot-fields-table td {
  box-sizing: border-box;
  height: 44px;
}

.snapshot-table__index {
  width: 48px;
  color: var(--sw-text-secondary);
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

/* 审查27 S14-F：校验/显隐/脚本折叠详情卡（白卡容器） */
.snapshot-fields-secondary {
  margin-bottom: 8px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-card, #fff);
}
.snapshot-fields-secondary > summary {
  padding: 9px 12px;
  color: var(--sw-text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.snapshot-fields-secondary .snapshot-section {
  padding: 0 12px 12px;
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

@media (max-width: 900px) {
  .snapshot-tabbody--full {
    max-height: 58vh;
  }

  .snapshot-meta,
  .snapshot-meta--compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

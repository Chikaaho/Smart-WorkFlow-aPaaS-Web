<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import type { FormSchemaField } from '@/contracts/form-schema'
import { getListConfig, saveListConfig, type ListConfig } from '@/modules/form/api/i2-choices'
import { ApiError } from '@/foundation/request'

const { t } = useI18n()
const props = defineProps<{ formId: string | null; fields: FormSchemaField[] }>()

interface ColumnDraft {
  name: string
  label: string
}

const columns = ref<ColumnDraft[]>([])
const filters = ref<string[]>([])
const sortName = ref('')
const sortDesc = ref(true)
const actions = ref<string[]>(['view'])
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const fieldOptions = computed(() =>
  props.fields.flatMap((field) => {
    if (field.type === 'TABLE' || field.type === 'LABEL') return []
    return [{ name: field.name, label: field.label || field.name, type: field.type }]
  }),
)

const filterOptions = computed(() =>
  fieldOptions.value.filter((field) =>
    ['TEXT', 'NUMBER', 'DATE', 'BOOL', 'DICT'].includes(field.type),
  ),
)

function defaultColumns(): ColumnDraft[] {
  return fieldOptions.value.map((field) => ({ name: field.name, label: field.label }))
}

async function load() {
  if (!props.formId) {
    columns.value = defaultColumns()
    filters.value = filterOptions.value.slice(0, 3).map((field) => field.name)
    return
  }
  loading.value = true
  error.value = ''
  try {
    const config = await getListConfig(props.formId)
    if (config?.columns?.length) {
      columns.value = config.columns.map((column) => ({
        name: column.name,
        label:
          column.label ||
          fieldOptions.value.find((field) => field.name === column.name)?.label ||
          column.name,
      }))
      filters.value = config.filters?.map((item) => item.name) ?? []
      sortName.value = config.defaultSort?.name ?? ''
      sortDesc.value = config.defaultSort?.desc ?? true
      actions.value = config.actions?.length ? [...config.actions] : ['view']
    } else {
      columns.value = defaultColumns()
      filters.value = filterOptions.value.slice(0, 3).map((field) => field.name)
      sortName.value = ''
      sortDesc.value = true
      actions.value = ['view']
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.msg : t('form.listConfigLoadFailed')
  } finally {
    loading.value = false
  }
}

function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= columns.value.length) return
  const next = [...columns.value]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  columns.value = next
}

function removeColumn(index: number) {
  columns.value = columns.value.filter((_, current) => current !== index)
  if (sortName.value && !columns.value.some((column) => column.name === sortName.value)) {
    sortName.value = ''
  }
}

function addColumn(name: string) {
  const option = fieldOptions.value.find((field) => field.name === name)
  if (!option || columns.value.some((column) => column.name === name)) return
  columns.value.push({ name: option.name, label: option.label })
}

async function save() {
  if (!props.formId || saving.value) return
  if (columns.value.length === 0) {
    error.value = t('form.listColumnsRequired')
    return
  }
  const config: ListConfig = {
    columns: columns.value.map((column) => ({ name: column.name, label: column.label })),
    filters: filters.value.map((name) => ({
      name,
      op: fieldOptions.value.find((field) => field.name === name)?.type === 'TEXT' ? 'LIKE' : 'EQ',
    })),
    ...(sortName.value ? { defaultSort: { name: sortName.value, desc: sortDesc.value } } : {}),
    actions: [...actions.value],
  }
  saving.value = true
  error.value = ''
  try {
    await saveListConfig(props.formId, config)
    ElMessage.success(t('common.saveSuccess'))
  } catch (err) {
    error.value = err instanceof ApiError ? err.msg : t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

onMounted(load)
watch(() => props.formId, load)
</script>

<template>
  <article v-loading="loading" class="list-config">
    <header class="list-config__header">
      <div>
        <h3>{{ t('form.listDefaults') }}</h3>
        <p>{{ t('form.listDefaultsHint') }}</p>
      </div>
      <el-button type="primary" :loading="saving" @click="save">
        {{ t('form.saveListDefaults') }}
      </el-button>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />

    <div class="list-config__body">
      <section class="list-config__section">
        <h4>{{ t('form.listColumns') }}</h4>
        <div class="column-add">
          <el-select
            :placeholder="t('form.addColumn')"
            clearable
            @update:model-value="(name: string) => addColumn(name)"
          >
            <el-option
              v-for="option in fieldOptions"
              :key="option.name"
              :value="option.name"
              :label="option.label"
              :disabled="columns.some((column) => column.name === option.name)"
            />
          </el-select>
        </div>
        <el-table :data="columns" max-height="260">
          <el-table-column prop="label" :label="t('form.field')" min-width="180" />
          <el-table-column width="170" :label="t('form.order')">
            <template #default="{ $index }">
              <el-button link :disabled="$index === 0" @click="move($index, -1)">↑</el-button>
              <el-button link :disabled="$index === columns.length - 1" @click="move($index, 1)"
                >↓</el-button
              >
              <el-button link type="danger" @click="removeColumn($index)">
                {{ t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section class="list-config__section">
        <h4>{{ t('form.listFilters') }}</h4>
        <el-checkbox-group v-model="filters">
          <el-checkbox v-for="field in filterOptions" :key="field.name" :value="field.name">
            {{ field.label }}
          </el-checkbox>
        </el-checkbox-group>
        <h4>{{ t('form.defaultSort') }}</h4>
        <div class="sort-row">
          <el-select v-model="sortName" clearable :placeholder="t('form.sortColumn')">
            <el-option
              v-for="column in columns"
              :key="column.name"
              :value="column.name"
              :label="column.label"
            />
          </el-select>
          <el-radio-group v-model="sortDesc" :disabled="!sortName">
            <el-radio-button :value="true">{{ t('form.descending') }}</el-radio-button>
            <el-radio-button :value="false">{{ t('form.ascending') }}</el-radio-button>
          </el-radio-group>
        </div>
        <h4>{{ t('form.listActions') }}</h4>
        <el-checkbox-group v-model="actions">
          <el-checkbox value="view">{{ t('form.actionView') }}</el-checkbox>
          <el-checkbox value="edit">{{ t('form.actionEdit') }}</el-checkbox>
          <el-checkbox value="delete">{{ t('form.actionDelete') }}</el-checkbox>
          <el-checkbox value="export">{{ t('form.actionExport') }}</el-checkbox>
          <el-checkbox value="import">{{ t('form.actionImport') }}</el-checkbox>
          <el-checkbox value="start-flow">{{ t('form.actionFlowStart') }}</el-checkbox>
        </el-checkbox-group>
      </section>
    </div>
  </article>
</template>

<style scoped>
.list-config {
  padding: var(--sw-space-20);
  margin-bottom: var(--sw-space-16);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: var(--sw-fill-base);
}
.list-config__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sw-space-20);
  margin-bottom: var(--sw-space-16);
}
.list-config__header h3,
.list-config__section h4 {
  margin: 0;
  color: var(--sw-text-primary);
}
.list-config__header h3 {
  font-size: var(--sw-font-h2);
}
.list-config__header p {
  margin: var(--sw-space-4) 0 0;
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
}
.list-config__body {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: var(--sw-space-24);
}
.list-config__section h4 {
  margin: var(--sw-space-16) 0 var(--sw-space-8);
  font-size: var(--sw-font-body);
}
.list-config__section h4:first-child {
  margin-top: 0;
}
.column-add {
  margin-bottom: var(--sw-space-8);
}
.column-add .el-select,
.sort-row .el-select {
  width: 100%;
}
.sort-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--sw-space-12);
}
@media (max-width: 1000px) {
  .list-config__body {
    grid-template-columns: 1fr;
  }
}
</style>

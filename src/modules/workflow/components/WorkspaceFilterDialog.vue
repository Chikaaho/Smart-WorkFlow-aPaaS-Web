<script setup lang="ts">
/** 工作台筛选条件编辑：字段/操作符/值均来自当前账号可见字段。 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import type { WorkspaceField, WorkspaceFilter, WorkspaceFilterOp } from '../api/workspace-analytics'

const props = defineProps<{
  modelValue: boolean
  fields: WorkspaceField[]
  filters: WorkspaceFilter[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [filters: WorkspaceFilter[]]
}>()

const { t } = useI18n()
const draft = ref<WorkspaceFilter[]>([])

watch(
  () => props.modelValue,
  (open) => {
    if (open) draft.value = props.filters.map((filter) => ({ ...filter }))
  },
)

function ops(fieldName: string): WorkspaceFilterOp[] {
  const type = props.fields.find((field) => field.name === fieldName)?.type ?? 'TEXT'
  if (type === 'TEXT') return ['EQ', 'LIKE']
  if (type === 'NUMBER' || type === 'DATE' || type === 'TIME') return ['EQ', 'GE', 'LE']
  return ['EQ']
}

function options(fieldName: string) {
  return props.fields.find((field) => field.name === fieldName)?.options ?? []
}

function addFilter(): void {
  const first = props.fields[0]
  if (!first) return
  draft.value.push({ field: first.name, op: ops(first.name)[0], value: '' })
}

function changeField(filter: WorkspaceFilter): void {
  const allowed = ops(filter.field)
  if (!allowed.includes(filter.op)) filter.op = allowed[0]
  filter.value = ''
}

function remove(index: number): void {
  draft.value.splice(index, 1)
}

function confirm(): void {
  const applied = draft.value.filter(
    (filter) => filter.field && filter.op && String(filter.value ?? '').trim() !== '',
  )
  emit('apply', applied)
  emit('update:modelValue', false)
}

const valid = computed(() =>
  draft.value.every((filter) => String(filter.value ?? '').trim() !== ''),
)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.filter.title')"
    width="560px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wfilter">
      <div v-if="!fields.length" class="wfilter__empty">{{ t('workspace.filter.noFields') }}</div>
      <div v-for="(filter, index) in draft" :key="index" class="wfilter__row">
        <el-select
          v-model="filter.field"
          size="small"
          class="wfilter__field"
          @change="changeField(filter)"
        >
          <el-option
            v-for="field in fields"
            :key="field.name"
            :label="field.label"
            :value="field.name"
          />
        </el-select>
        <el-select v-model="filter.op" size="small" class="wfilter__op">
          <el-option v-for="op in ops(filter.field)" :key="op" :label="op" :value="op" />
        </el-select>
        <el-select
          v-if="options(filter.field).length"
          v-model="filter.value"
          size="small"
          class="wfilter__value"
        >
          <el-option
            v-for="option in options(filter.field)"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-input
          v-else
          v-model="filter.value as string"
          size="small"
          class="wfilter__value"
          :placeholder="t('workspace.filter.value')"
        />
        <button type="button" class="wfilter__remove" @click="remove(index)">×</button>
      </div>
      <el-button size="small" plain @click="addFilter">{{ t('workspace.filter.add') }}</el-button>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!valid" @click="confirm">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.wfilter {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wfilter__empty {
  color: var(--sw-text-tertiary);
  font-size: 12px;
}

.wfilter__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wfilter__field {
  width: 150px;
}

.wfilter__op {
  width: 72px;
}

.wfilter__value {
  flex: 1;
}

.wfilter__remove {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--sw-text-tertiary);
  font-size: 16px;
  cursor: pointer;
}
</style>

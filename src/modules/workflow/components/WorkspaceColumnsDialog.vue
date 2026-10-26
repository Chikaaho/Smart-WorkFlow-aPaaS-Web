<script setup lang="ts">
/** 数据列表列头：选择、排序、标题与移除。 */
import { ref, watch } from 'vue'
import { useI18n } from '@/locales'
import type { WorkspaceField } from '../api/workspace-analytics'
import type { WorkspaceColumnConfig } from '../utils/workspace-data'

const props = defineProps<{
  modelValue: boolean
  fields: WorkspaceField[]
  columns: WorkspaceColumnConfig[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [columns: WorkspaceColumnConfig[]]
}>()

const { t } = useI18n()
const draft = ref<WorkspaceColumnConfig[]>([])
const adding = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      draft.value = props.columns.map((column) => ({ ...column }))
      adding.value = ''
    }
  },
)

function available() {
  return props.fields.filter((field) => !draft.value.some((column) => column.field === field.name))
}

function add(): void {
  const field = props.fields.find((item) => item.name === adding.value)
  if (!field) return
  draft.value.push({ field: field.name, label: field.label })
  adding.value = ''
}

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= draft.value.length) return
  const [item] = draft.value.splice(index, 1)
  draft.value.splice(target, 0, item)
}

function remove(index: number): void {
  draft.value.splice(index, 1)
}

function confirm(): void {
  emit(
    'apply',
    draft.value.filter((column) => column.field),
  )
  emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.columns.title')"
    width="560px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wcolumns">
      <div v-for="(column, index) in draft" :key="column.field" class="wcolumns__row">
        <span class="wcolumns__field">{{ column.field }}</span>
        <el-input v-model="column.label" size="small" class="wcolumns__label" />
        <button
          type="button"
          class="wcolumns__btn"
          :disabled="index === 0"
          @click="move(index, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          class="wcolumns__btn"
          :disabled="index === draft.length - 1"
          @click="move(index, 1)"
        >
          ↓
        </button>
        <button type="button" class="wcolumns__btn" @click="remove(index)">×</button>
      </div>
      <div class="wcolumns__add">
        <el-select v-model="adding" size="small" :placeholder="t('workspace.columns.pick')">
          <el-option
            v-for="field in available()"
            :key="field.name"
            :label="field.label"
            :value="field.name"
          />
        </el-select>
        <el-button size="small" plain :disabled="!adding" @click="add">
          {{ t('workspace.columns.add') }}
        </el-button>
      </div>
      <p v-if="!draft.length" class="wcolumns__empty">{{ t('workspace.columns.empty') }}</p>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!draft.length" @click="confirm">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.wcolumns {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wcolumns__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wcolumns__field {
  width: 130px;
  color: var(--sw-text-tertiary);
  font-size: 12px;
}

.wcolumns__label {
  flex: 1;
}

.wcolumns__btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 4px;
  background: #fff;
  color: var(--sw-text-secondary);
  cursor: pointer;
}

.wcolumns__btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.wcolumns__add {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--sw-border-light, #eef0f4);
}

.wcolumns__empty {
  margin: 0;
  color: var(--sw-text-tertiary);
  font-size: 12px;
}
</style>

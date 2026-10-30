<script setup lang="ts">
/** 工作台筛选条件编辑：字段/操作符/值均来自当前账号可见字段。 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import type { WorkspaceField, WorkspaceFilter, WorkspaceFilterOp } from '../api/workspace-analytics'

const props = defineProps<{
  modelValue: boolean
  fields: WorkspaceField[]
  filters: WorkspaceFilter[]
  /** 真实命中数：仅当上游提供真实计数时展示，组件自身不估算、不造数。 */
  matchCount?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  apply: [filters: WorkspaceFilter[]]
}>()

const { t } = useI18n()
const draft = ref<WorkspaceFilter[]>([])

/** 操作符枚举只用于内部取值；下拉展示统一走本地化文案，避免直接暴露 EQ/LIKE 等枚举。 */
const OP_LABEL_KEYS: Record<WorkspaceFilterOp, string> = {
  EQ: 'form.opEquals',
  LIKE: 'workspace.filter.opLike',
  GE: 'workspace.filter.opGe',
  LE: 'workspace.filter.opLe',
}

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
  <!-- 提示28 Q01：680 窗口，条件行 字段180 / 操作符140 / 值288×32 -->
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.filter.title')"
    width="680px"
    append-to-body
    class="wfilter-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wfilter">
      <p class="wfilter__lead">{{ t('workspace.filter.allConditions') }}</p>
      <div v-if="!fields.length" class="wfilter__empty">{{ t('workspace.filter.noFields') }}</div>
      <div v-for="(filter, index) in draft" :key="index" class="wfilter__row">
        <el-select v-model="filter.field" class="wfilter__field" @change="changeField(filter)">
          <el-option
            v-for="field in fields"
            :key="field.name"
            :label="field.label"
            :value="field.name"
          />
        </el-select>
        <el-select v-model="filter.op" class="wfilter__op">
          <el-option
            v-for="op in ops(filter.field)"
            :key="op"
            :label="t(OP_LABEL_KEYS[op])"
            :value="op"
          />
        </el-select>
        <el-select
          v-if="options(filter.field).length"
          v-model="filter.value"
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
          class="wfilter__value"
          :placeholder="t('workspace.filter.value')"
        />
        <button
          type="button"
          class="wfilter__remove"
          :aria-label="t('common.remove')"
          @click="remove(index)"
        >
          ×
        </button>
      </div>
      <button type="button" class="wfilter__add" @click="addFilter">
        + {{ t('workspace.filter.add') }}
      </button>
      <!-- 命中数表面：只在拿到真实计数且条件完整时显示；空条件/空值保持空态，不造命中数 -->
      <p v-if="typeof matchCount === 'number' && draft.length && valid" class="wfilter__match">
        {{ t('workspace.filter.matchCount', { count: matchCount }) }}
      </p>
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

.wfilter__lead {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 13px;
  line-height: 20px;
}

.wfilter__empty {
  color: var(--sw-text-tertiary);
  font-size: 12px;
}

.wfilter__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 提示28 Q01：字段180 / 操作符140 / 值288，控件统一 32 高（Element Plus 默认尺寸）。
   三段 608 + 3×6 间距 + 20 移除钮 = 646，弹窗体水平内距固定 16 才容得下，禁止收缩。 */
.wfilter__field {
  flex: 0 0 180px;
  width: 180px;
  flex-shrink: 0;
}

.wfilter__op {
  flex: 0 0 140px;
  width: 140px;
  flex-shrink: 0;
}

.wfilter__value {
  flex: 0 0 288px;
  width: 288px;
  flex-shrink: 0;
}

.wfilter__remove {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sw-text-tertiary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.wfilter__add {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sw-color-primary, #2563eb);
  font-size: 13px;
  line-height: 22px;
  cursor: pointer;
}

.wfilter__match {
  margin: 0;
  color: var(--sw-text-tertiary);
  font-size: 12px;
}

/* teleport 到 body 的弹窗体：水平内距固定 16，条件行 646 ≤ 648 不收缩 */
:global(.wfilter-dialog .el-dialog__body) {
  padding: 12px 16px;
}
</style>

<script setup lang="ts">
/**
 * 数据列表列头：显示、列名、顺序绑定既有列配置。
 *
 * “显示”勾选表示该列是否随确定写入列配置；宽度由布局自适应呈现，
 * 不新增配置字段、不单独保存列配置（取消退出语义与原先一致）。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import type { WorkspaceField } from '../api/workspace-analytics'
import type { WorkspaceColumnConfig } from '../utils/workspace-data'

interface DraftColumn extends WorkspaceColumnConfig {
  included: boolean
}

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
const draft = ref<DraftColumn[]>([])
const adding = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      draft.value = props.columns.map((column) => ({ ...column, included: true }))
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
  draft.value.push({ field: field.name, label: field.label, included: true })
  adding.value = ''
}

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= draft.value.length) return
  const [item] = draft.value.splice(index, 1)
  draft.value.splice(target, 0, item)
}

const hasIncluded = computed(() => draft.value.some((column) => column.included && column.field))

function confirm(): void {
  emit(
    'apply',
    draft.value.filter((column) => column.included && column.field),
  )
  emit('update:modelValue', false)
}
</script>

<template>
  <!-- 提示28 Q02：880 窗口，五列 显示/字段/列头名称/宽度/顺序，表头带 36 高、行内控件 32 高 -->
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.columns.title')"
    width="880px"
    append-to-body
    class="wcolumns-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wcolumns">
      <div class="wcolumns__head">
        <span>{{ t('workspace.columns.show') }}</span>
        <span>{{ t('workspace.columns.field') }}</span>
        <span>{{ t('workspace.columns.headerName') }}</span>
        <span>{{ t('workspace.columns.width') }}</span>
        <span>{{ t('workspace.columns.order') }}</span>
      </div>
      <div v-for="(column, index) in draft" :key="column.field" class="wcolumns__row">
        <el-checkbox v-model="column.included" />
        <span class="wcolumns__field">{{ column.field }}</span>
        <el-input v-model="column.label" class="wcolumns__label" />
        <el-input
          class="wcolumns__width"
          :model-value="t('workspace.columns.adaptive')"
          readonly
          :title="t('workspace.columns.adaptive')"
        />
        <div class="wcolumns__order">
          <button
            type="button"
            class="wcolumns__btn"
            :disabled="index === 0"
            :aria-label="t('common.moveUp')"
            @click="move(index, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="wcolumns__btn"
            :disabled="index === draft.length - 1"
            :aria-label="t('common.moveDown')"
            @click="move(index, 1)"
          >
            ↓
          </button>
        </div>
      </div>
      <div class="wcolumns__add">
        <el-select v-model="adding" :placeholder="t('workspace.columns.pick')">
          <el-option
            v-for="field in available()"
            :key="field.name"
            :label="field.label"
            :value="field.name"
          />
        </el-select>
        <el-button plain :disabled="!adding" @click="add">
          {{ t('workspace.columns.add') }}
        </el-button>
      </div>
      <p v-if="!draft.length" class="wcolumns__empty">{{ t('workspace.columns.empty') }}</p>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!hasIncluded" @click="confirm">
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

.wcolumns__head,
.wcolumns__row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1.2fr) minmax(0, 1.8fr) 150px 96px;
  gap: 12px;
  align-items: center;
}

/* 提示28 Q02：表头底色带 36 高 */
.wcolumns__head {
  box-sizing: border-box;
  height: 36px;
  align-content: center;
  padding: 0 12px;
  border-radius: 4px;
  background: #f5f7fa;
  color: var(--sw-text-tertiary);
  font-size: 12px;
}

.wcolumns__row {
  min-height: 48px;
  padding: 8px 12px;
  border-bottom: 1px solid #f0f2f7;
}

.wcolumns__field {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sw-text-primary);
  font-size: 13px;
}

/* 宽度由布局自适应呈现：只读展示，不新增配置字段 */
.wcolumns__width :deep(.el-input__inner) {
  color: var(--sw-text-tertiary);
}

.wcolumns__order {
  display: flex;
  gap: 8px;
}

/* 提示28 Q02：行内控件 32 高（输入框/勾选为 Element Plus 默认尺寸） */
.wcolumns__btn {
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--sw-border-base, #dcdfe6);
  border-radius: 4px;
  background: #fff;
  color: var(--sw-text-secondary);
  font-size: 14px;
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

.wcolumns__add .el-select {
  flex: 1;
}

.wcolumns__empty {
  margin: 0;
  color: var(--sw-text-tertiary);
  font-size: 12px;
}
</style>

<style>
/* 提示28 Q02：880 窗口 24 内边距（与指标窗口同模式） */
.wcolumns-dialog.el-dialog {
  padding: 24px;
}
</style>

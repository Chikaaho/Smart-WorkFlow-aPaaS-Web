<script setup lang="ts">
/**
 * WorkspaceFieldPickerDialog — 工作台「字段选择」弹窗（设计 653:31851 / 653:31853）。
 *
 * 680 宽选择窗：32 高搜索框、54 高字段行（名称 + 类型标签 + 当前选中勾选），
 * 真实单选。仅打开/本地选择/取消回显；不落库、不改候选来源。
 * 维度（Q03）与排序字段（Q05）共用本表面，候选与绑定由调用方传入，不混淆。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import type { WorkspaceField } from '../api/workspace-analytics'

const props = defineProps<{
  modelValue: boolean
  fields: WorkspaceField[]
  /** 当前绑定字段名；null/空表示未选择。 */
  currentField?: string | null
  /** 弹窗标题 i18n 键：维度窗/排序窗各自传入，不共用文案。 */
  titleKey: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [fieldName: string]
}>()

const { t } = useI18n()
const keyword = ref('')
const picked = ref<string | null>(null)

/** 字段行右侧类型短标签（设计原图：单选/部门/日期/文本）。 */
const TYPE_LABEL_KEYS: Record<string, string> = {
  TEXT: 'workspace.fieldPicker.typeText',
  NUMBER: 'workspace.fieldPicker.typeNumber',
  DATE: 'workspace.fieldPicker.typeDate',
  TIME: 'workspace.fieldPicker.typeTime',
  BOOL: 'workspace.fieldPicker.typeBool',
  DICT: 'workspace.fieldPicker.typeDict',
  REFERENCE: 'workspace.fieldPicker.typeReference',
  USER: 'workspace.fieldPicker.typeUser',
  DEPT: 'workspace.fieldPicker.typeDept',
  FORMULA: 'workspace.fieldPicker.typeFormula',
}

const filteredFields = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return props.fields
  return props.fields.filter(
    (field) => field.label.toLowerCase().includes(kw) || field.name.toLowerCase().includes(kw),
  )
})

function typeLabel(field: WorkspaceField): string {
  const key = TYPE_LABEL_KEYS[field.type]
  return key ? t(key) : field.type
}

function pick(field: WorkspaceField): void {
  picked.value = field.name
}

function pickAndConfirm(field: WorkspaceField): void {
  pick(field)
  confirmSelection()
}

function confirmSelection(): void {
  if (!picked.value) return
  emit('select', picked.value)
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      keyword.value = ''
      picked.value = props.currentField ?? null
    }
  },
)
</script>

<template>
  <!-- 提示30 Q03/Q05：680 选择窗，搜索 32 高、字段行 54 高（border-box） -->
  <el-dialog
    :model-value="modelValue"
    :title="t(titleKey)"
    width="680px"
    append-to-body
    class="wfield-dialog"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wfield">
      <el-input
        v-model="keyword"
        class="wfield__search"
        :placeholder="t('workspace.fieldPicker.searchPlaceholder')"
        clearable
      />
      <div class="wfield__list">
        <button
          v-for="field in filteredFields"
          :key="field.name"
          type="button"
          class="wfield__row"
          :class="{ 'is-selected': picked === field.name }"
          @click="pick(field)"
          @dblclick="pickAndConfirm(field)"
        >
          <span class="wfield__name">{{ field.label }}</span>
          <span class="wfield__type">{{ typeLabel(field) }}</span>
          <span v-if="picked === field.name" class="wfield__check" aria-hidden="true">✓</span>
        </button>
        <p v-if="!filteredFields.length" class="wfield__empty">
          {{ t('workspace.fieldPicker.empty') }}
        </p>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!picked" @click="confirmSelection">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.wfield {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wfield__search {
  width: 100%;
}

.wfield__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}

/* 字段行 54 高 border-box：名称左对齐、类型标签与选中勾靠右 */
.wfield__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 54px;
  padding: 0 36px 0 16px;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 6px;
  background: var(--sw-surface-card, #fff);
  cursor: pointer;
  text-align: left;
}

.wfield__row:hover {
  border-color: var(--sw-color-primary, #2563eb);
}

.wfield__row.is-selected {
  border-color: var(--sw-color-primary, #2563eb);
  background: var(--sw-color-primary-soft, #eff6ff);
}

.wfield__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sw-text-primary, #1f2937);
  font-size: 13px;
  font-weight: 500;
}

.wfield__type {
  flex: 0 0 auto;
  color: var(--sw-text-tertiary, #9ca3af);
  font-size: 12px;
}

.wfield__check {
  position: absolute;
  right: 12px;
  color: var(--sw-color-primary, #2563eb);
  font-size: 13px;
}

.wfield__empty {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  color: var(--sw-text-tertiary, #9ca3af);
  font-size: 12px;
}
</style>

<style>
/* teleport 到 body 的弹窗体：沿用 wcolumns-dialog 的 :global 落根模式 */
.wfield-dialog.el-dialog {
  padding: 24px;
}
</style>

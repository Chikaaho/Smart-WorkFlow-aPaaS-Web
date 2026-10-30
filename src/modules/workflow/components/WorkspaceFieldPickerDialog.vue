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

interface WorkspaceFieldGroup {
  /** 分组标识：ProcessDesigner 传主表 MAIN 或明细表字段名。 */
  key: string
  label: string
  /** 分组右侧类型标签（原图：明细表）。 */
  tag?: string
  fields: WorkspaceField[]
}

const props = defineProps<{
  modelValue: boolean
  fields?: WorkspaceField[]
  /** 当前绑定字段名；null/空表示未选择。 */
  currentField?: string | null
  /** 弹窗标题 i18n 键：维度窗/排序窗各自传入，不共用文案。 */
  titleKey?: string
  /** 直接标题（流程设计器中文面板沿用硬编码文案，不新增 locale 资源）。 */
  title?: string
  /** 分组候选：主表/明细表分段；为空时沿用既有一维字段列表。 */
  groups?: WorkspaceFieldGroup[] | null
  /** 紧凑变体：44 选中行 / 72 底栏（574:27788），默认仍是 54 行。 */
  compact?: boolean
  /** 列表下方业务说明（原图：使用该组件填写的人员作为审批人）。 */
  hint?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [fieldName: string]
  /** 分组模式选中：字段名 + 分组标识（主表/明细表区分，不混淆同名叶子）。 */
  'select-group': [fieldName: string, groupKey: string]
}>()

const { t } = useI18n()
const keyword = ref('')
const picked = ref<string | null>(null)
const pickedGroup = ref<string | null>(null)

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
  const source = props.fields ?? []
  if (!kw) return source
  return source.filter(
    (field) => field.label.toLowerCase().includes(kw) || field.name.toLowerCase().includes(kw),
  )
})

/** 分组模式：搜索时隐藏全空分组；无搜索时保留真实空分组（如明细表无同类型列）。 */
const filteredGroups = computed(() => {
  const groups = props.groups ?? []
  const kw = keyword.value.trim().toLowerCase()
  const match = (field: WorkspaceField) =>
    !kw || field.label.toLowerCase().includes(kw) || field.name.toLowerCase().includes(kw)
  return groups
    .map((group) => ({ ...group, fields: group.fields.filter(match) }))
    .filter((group) => !kw || group.fields.length > 0)
})

const grouped = computed(() => Boolean(props.groups?.length))
const dialogTitle = computed(() => props.title ?? (props.titleKey ? t(props.titleKey) : ''))

function typeLabel(field: WorkspaceField): string {
  const key = TYPE_LABEL_KEYS[field.type]
  return key ? t(key) : field.type
}

function pick(field: WorkspaceField, groupKey?: string): void {
  picked.value = field.name
  pickedGroup.value = groupKey ?? null
}

function isPicked(field: WorkspaceField, groupKey?: string): boolean {
  if (picked.value !== field.name) return false
  return !grouped.value || pickedGroup.value === (groupKey ?? null)
}

function pickAndConfirm(field: WorkspaceField, groupKey?: string): void {
  pick(field, groupKey)
  confirmSelection()
}

function confirmSelection(): void {
  if (!picked.value) return
  if (grouped.value) {
    emit('select-group', picked.value, pickedGroup.value ?? '')
  } else {
    emit('select', picked.value)
  }
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      keyword.value = ''
      picked.value = props.currentField ?? null
      const initialGroup = (props.groups ?? []).find((group) =>
        group.fields.some((field) => field.name === picked.value),
      )
      pickedGroup.value = initialGroup?.key ?? null
    }
  },
)
</script>

<template>
  <!-- 提示30 Q03/Q05：680 选择窗，搜索 32 高、字段行 54 高（border-box）；
       提示32 Q17：紧凑变体 44 选中行 + 72 底栏，主表/明细表分组。 -->
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="680px"
    append-to-body
    :class="['wfield-dialog', { 'wfield-dialog--compact': compact }]"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wfield" :class="{ 'wfield--compact': compact }">
      <el-input
        v-model="keyword"
        class="wfield__search"
        :placeholder="t('workspace.fieldPicker.searchPlaceholder')"
        clearable
      />
      <div class="wfield__list">
        <template v-if="grouped">
          <template v-for="group in filteredGroups" :key="group.key">
            <div class="wfield__group">
              <span class="wfield__group-name">{{ group.label }}</span>
              <span v-if="group.tag" class="wfield__group-tag">{{ group.tag }}</span>
            </div>
            <button
              v-for="field in group.fields"
              :key="`${group.key}:${field.name}`"
              type="button"
              class="wfield__row"
              :class="{ 'is-selected': isPicked(field, group.key) }"
              @click="pick(field, group.key)"
              @dblclick="pickAndConfirm(field, group.key)"
            >
              <span class="wfield__name">{{ field.label }}</span>
              <span class="wfield__type">{{ typeLabel(field) }}</span>
              <span v-if="isPicked(field, group.key)" class="wfield__check" aria-hidden="true"
                >✓</span
              >
            </button>
            <p v-if="!group.fields.length" class="wfield__group-empty">
              {{ t('workspace.fieldPicker.empty') }}
            </p>
          </template>
        </template>
        <template v-else>
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
        </template>
      </div>
      <p v-if="hint" class="wfield__hint">{{ hint }}</p>
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

/* 574:27788：主表/明细表分组标题 + 中性类型标签 */
.wfield__group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  margin-top: 8px;
}

.wfield__group:first-child {
  margin-top: 0;
}

.wfield__group-name {
  color: var(--sw-text-primary, #19233b);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}

.wfield__group-tag {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border-radius: 4px;
  background: #f4f4f5;
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}

.wfield__group-empty {
  margin: 0;
  padding: 6px 0 8px;
  color: var(--sw-text-tertiary, #9ca3af);
  font-size: 12px;
  line-height: 18px;
}

.wfield__hint {
  margin: 0;
  color: var(--sw-text-tertiary, #9ca3af);
  font-size: 12px;
  line-height: 18px;
}

/* 574:27788 紧凑变体：44 选中行（无描边卡片）+ 2 行距 */
.wfield--compact .wfield__list {
  gap: 2px;
}

.wfield--compact .wfield__row {
  height: 44px;
  padding: 0 36px 0 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
}

.wfield--compact .wfield__row:hover {
  border-color: transparent;
  background: var(--sw-color-primary-soft, #f2eaf0);
}

.wfield--compact .wfield__row.is-selected {
  border-color: transparent;
  background: var(--sw-color-primary-soft, #f2eaf0);
}
</style>

<style>
/* teleport 到 body 的弹窗体：沿用 wcolumns-dialog 的 :global 落根模式 */
.wfield-dialog.el-dialog {
  padding: 24px;
}

/* 574:27788：72 高底栏、72×32 按钮（紧凑变体专属，默认 54 行窗保持原样） */
.wfield-dialog--compact .el-dialog__footer {
  box-sizing: border-box;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 8px;
  height: 72px;
  padding: 0;
}

.wfield-dialog--compact .el-dialog__footer .el-button {
  width: 72px;
  height: 32px;
  margin: 0;
  padding: 0;
}
</style>

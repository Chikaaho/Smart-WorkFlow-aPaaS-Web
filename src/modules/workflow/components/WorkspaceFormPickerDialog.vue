<script setup lang="ts">
/**
 * WorkspaceFormPickerDialog — 工作台「选择表单」弹窗（设计 645:28735）。
 *
 * 左侧应用分类单字列表（全部应用＋各可见应用，左对齐/首字图标），
 * 右侧表单卡（名称＋可见记录数），选中态高亮；确定后回填 formKey。
 * 分类是弹窗内选择器：保留局部尺寸与选择语义，不引入全局侧栏开关。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import type { WorkspaceFormSource } from '../api/workspace-analytics'

const props = defineProps<{
  modelValue: boolean
  sources: WorkspaceFormSource[]
  currentFormKey?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [formKey: string]
}>()

const { t } = useI18n()

const keyword = ref('')
const activeAppId = ref<string | 'all'>('all')
const selectedFormKey = ref<string | null>(null)

/** 应用分类：全部应用 + 各可见应用（保持 sources 首次出现顺序）。 */
const categories = computed(() => {
  const seen = new Map<string, string>()
  for (const source of props.sources) {
    if (source.appId && source.appName && !seen.has(source.appId)) {
      seen.set(source.appId, source.appName)
    }
  }
  return [
    { id: 'all' as const, name: t('workspace.formPicker.allApps') },
    ...[...seen.entries()].map(([id, name]) => ({ id, name })),
  ]
})

const filteredForms = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return props.sources.filter((source) => {
    if (activeAppId.value !== 'all' && source.appId !== activeAppId.value) return false
    if (!kw) return true
    return source.name.toLowerCase().includes(kw) || source.formKey.toLowerCase().includes(kw)
  })
})

function glyphOf(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.charAt(0) : ''
}

function pick(source: WorkspaceFormSource): void {
  selectedFormKey.value = source.formKey
}

function pickAndConfirm(source: WorkspaceFormSource): void {
  pick(source)
  confirmSelection()
}

function confirmSelection(): void {
  if (!selectedFormKey.value) return
  emit('select', selectedFormKey.value)
  emit('update:modelValue', false)
}

function close(): void {
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      keyword.value = ''
      activeAppId.value = 'all'
      selectedFormKey.value = props.currentFormKey ?? null
    }
  },
)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('workspace.formPicker.title')"
    width="880px"
    append-to-body
    class="wsfp-dialog"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="wsfp">
      <el-input
        v-model="keyword"
        :placeholder="t('workspace.formPicker.searchPlaceholder')"
        clearable
        class="wsfp__search"
      />

      <div class="wsfp__body">
        <nav class="wsfp__cats" :aria-label="t('workspace.formPicker.categories')">
          <button
            v-for="cat in categories"
            :key="cat.id"
            type="button"
            class="wsfp__cat"
            :class="{ 'is-active': activeAppId === cat.id }"
            @click="activeAppId = cat.id"
          >
            <span class="wsfp__cat-glyph" aria-hidden="true">{{ glyphOf(cat.name) }}</span>
            <span class="wsfp__cat-name">{{ cat.name }}</span>
          </button>
        </nav>

        <div class="wsfp__forms">
          <button
            v-for="source in filteredForms"
            :key="source.formKey"
            type="button"
            class="wsfp__form"
            :class="{ 'is-selected': selectedFormKey === source.formKey }"
            @click="pick(source)"
            @dblclick="pickAndConfirm(source)"
          >
            <span class="wsfp__form-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M7 3h8l4 4v14H7z" stroke-linejoin="round" />
                <path d="M15 3v4h4M10 12h6M10 16h6" stroke-linecap="round" />
              </svg>
            </span>
            <span class="wsfp__form-meta">
              <span class="wsfp__form-name">{{ source.name }}</span>
              <span class="wsfp__form-count">
                {{ t('workspace.formPicker.recordCount', { count: source.recordCount ?? 0 }) }}
              </span>
            </span>
            <span
              v-if="selectedFormKey === source.formKey"
              class="wsfp__form-check"
              aria-hidden="true"
            >
              ✓
            </span>
          </button>
          <p v-if="!filteredForms.length" class="wsfp__empty">
            {{ t('workspace.formPicker.empty') }}
          </p>
        </div>
      </div>

      <p class="wsfp__hint">{{ t('workspace.formPicker.hint') }}</p>
    </div>

    <template #footer>
      <el-button @click="close">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!selectedFormKey" @click="confirmSelection">
        {{ t('form.confirmSelection') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 审查23 W19-F：880 窗口、192 目录、单列 64 高表单行、搜索 830 */
.wsfp {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wsfp__search {
  width: 100%;
}
.wsfp__body {
  display: grid;
  grid-template-columns: 192px minmax(0, 1fr);
  gap: 12px;
  min-height: 280px;
}
.wsfp__cats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  overflow-y: auto;
}
.wsfp__cat {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 8px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: transparent;
  font-size: 13px;
  color: var(--sw-text-regular);
  text-align: left;
  cursor: pointer;
}
.wsfp__cat:hover {
  background: var(--sw-color-primary-soft);
}
.wsfp__cat.is-active {
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-weight: 500;
}
.wsfp__cat-glyph {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-light, #f0f2f5);
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsfp__cat.is-active .wsfp__cat-glyph {
  background: #ffffff;
  color: var(--sw-color-primary);
}
.wsfp__cat-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsfp__forms {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-content: start;
  padding: 4px;
  overflow-y: auto;
  max-height: 456px;
}
.wsfp__form {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  height: 64px;
  padding: 0 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: var(--sw-surface-card);
  text-align: left;
  cursor: pointer;
}
.wsfp__form:hover {
  border-color: var(--sw-color-primary);
}
.wsfp__form.is-selected {
  border-color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
}
.wsfp__form-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
}
.wsfp__form-icon svg {
  width: 18px;
  height: 18px;
}
.wsfp__form-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.wsfp__form-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsfp__form-count {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsfp__form-check {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 13px;
  color: var(--sw-color-primary);
}
.wsfp__empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsfp__hint {
  margin: 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
</style>

<style>
/* 审查23 W19-F：内部搜索 830 宽、72×32 底栏 */
.wsfp-dialog .wsfp__search {
  width: 830px;
  max-width: 100%;
}
.wsfp-dialog .el-dialog__footer .el-button {
  width: 72px;
  height: 32px;
  margin: 0;
  padding: 0;
}
</style>

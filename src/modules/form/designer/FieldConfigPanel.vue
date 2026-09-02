<script setup lang="ts">
/**
 * 配置面板（设计器右栏）—— 宿主只按注册表动态挂载，禁写死类型 switch。
 *
 * 选中字段后，按注册表描述符的 configComponent 动态挂载该类型的配置面板：
 *  - 6 类简单字段（TEXT/RICH_TEXT/NUMBER/DATE/BOOL/DICT）有配置面板（第二刀填入）；
 *  - REFERENCE/TABLE 的 configComponent 仍为 null → 渲染「待接入」占位（后续刀填）。
 *
 * 配置面板改动经 @update 抛 FieldPatch，本宿主原样上交给设计器写回选中字段（单一数据源）。
 */
import { computed } from 'vue'
import { getFieldTypeDescriptor } from './field-types'
import type { DesignerItem } from './types'
import type { FieldPatch } from './field-config'
import { normalizeFormFieldColSpan } from '@/contracts/form-layout'

const props = withDefaults(
  defineProps<{
    field: DesignerItem | null
    /** 同表单内**其它**字段的列名（不含选中字段），透传给配置面板做重名校验。 */
    otherNames: string[]
    /** 已发布表单：禁止编辑配置。 */
    readonly?: boolean
  }>(),
  { readonly: false },
)

const emit = defineEmits<{ update: [patch: FieldPatch] }>()

const descriptor = computed(() =>
  props.field ? getFieldTypeDescriptor(props.field.field.type) : undefined,
)

const colSpan = computed(() =>
  props.field ? normalizeFormFieldColSpan(props.field.field.colSpan, props.field.field.type) : 12,
)

function updateColSpan(value: number | null | undefined) {
  if (!props.field) return
  emit('update', {
    colSpan: normalizeFormFieldColSpan(value, props.field.field.type),
  })
}
</script>

<template>
  <aside class="config">
    <h2 class="config__title">字段配置</h2>

    <p v-if="!field" class="config__hint">请选择一个字段</p>

    <template v-else>
      <div class="config__meta">
        <span class="config__type">{{ descriptor?.label ?? field.field.type }}</span>
        <span class="config__name">{{ field.field.name }}</span>
      </div>

      <div v-if="!readonly" class="config__layout">
        <div class="config__layout-label">
          <span>列宽</span>
          <span class="config__layout-value">{{ colSpan }} / 24 列</span>
        </div>
        <el-input-number
          :model-value="colSpan"
          :min="1"
          :max="24"
          :step="1"
          controls-position="right"
          class="config__layout-control"
          @update:model-value="updateColSpan"
        />
        <p class="config__layout-hint">调整后会按从左到右、从上到下自动紧凑排布。</p>
      </div>

      <!-- 已发布：只读，不渲染可编辑配置面板 -->
      <p v-if="readonly" class="config__readonly-hint">已发布表单，配置只读</p>

      <!-- 配置内容挂载位：6 类简单字段已填入面板；REF/TABLE 仍为 null → 占位。 -->
      <template v-else>
        <component
          :is="descriptor.configComponent"
          v-if="descriptor?.configComponent"
          :field="field.field"
          :other-names="otherNames"
          @update="(p: FieldPatch) => emit('update', p)"
        />
        <p v-else class="config__placeholder">
          「{{ descriptor?.label ?? '该字段' }}」配置项待接入（后续刀）
        </p>
      </template>
    </template>
  </aside>
</template>

<style scoped>
.config {
  width: 280px;
  flex: 0 0 280px;
  border-left: 1px solid var(--sw-border-light);
  padding: var(--sw-space-16);
  overflow-y: auto;
}

.config__title {
  margin: 0 0 var(--sw-space-12);
  font-size: var(--sw-font-h2);
  font-weight: var(--sw-font-weight-h2);
  color: var(--sw-text-primary);
}

.config__hint {
  color: var(--sw-text-placeholder);
  font-size: var(--sw-font-body);
}

.config__meta {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  margin-bottom: var(--sw-space-16);
}

.config__layout {
  margin-bottom: var(--sw-space-16);
  padding: var(--sw-space-12);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
}

.config__layout-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--sw-space-8);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-regular);
}

.config__layout-value,
.config__layout-hint {
  font-size: var(--sw-font-caption);
  font-weight: 400;
  color: var(--sw-text-secondary);
}

.config__layout-control {
  width: 100%;
}

.config__layout-hint {
  margin: var(--sw-space-8) 0 0;
  line-height: 1.5;
}

.config__type {
  padding: 0 var(--sw-space-8);
  height: 22px;
  line-height: 22px;
  font-size: var(--sw-font-caption);
  color: var(--sw-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: var(--sw-radius-sm);
}

.config__name {
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
  font-family: var(--el-font-family-mono, monospace);
}

.config__readonly-hint {
  padding: var(--sw-space-16);
  border: 1px dashed var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-secondary);
  text-align: center;
}

.config__placeholder {
  padding: var(--sw-space-16);
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-placeholder);
  font-size: var(--sw-font-secondary);
  text-align: center;
}
</style>

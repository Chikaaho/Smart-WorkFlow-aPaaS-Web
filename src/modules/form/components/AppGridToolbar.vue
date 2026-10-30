<script setup lang="ts">
/**
 * AppGridToolbar — 应用中心/应用管理共用的搜索条。
 *
 * 左侧搜索框撑满可用宽度，右侧 actions 槽放页面级动作（如每行列数设置）。
 */

withDefaults(
  defineProps<{
    modelValue: string
    placeholder: string
    label?: string
    testId?: string
  }>(),
  { testId: 'app-grid-search', label: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: []
}>()
</script>

<template>
  <div class="app-grid-toolbar">
    <label v-if="label" class="app-grid-toolbar__label" :for="`${testId}-input`">{{ label }}</label>
    <el-input
      :id="`${testId}-input`"
      class="app-grid-toolbar__search"
      :model-value="modelValue"
      :placeholder="placeholder"
      clearable
      :data-testid="testId"
      @update:model-value="emit('update:modelValue', $event)"
      @keyup.enter="emit('search')"
      @clear="emit('search')"
    />
    <div class="app-grid-toolbar__actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.app-grid-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  min-height: 64px;
  padding: calc(var(--sw-space-16) - 1px) var(--sw-space-16);
  margin-bottom: var(--sw-space-16);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: var(--sw-surface-card);
}
.app-grid-toolbar__label {
  color: var(--sw-text-regular);
  font-size: var(--sw-font-body);
  white-space: nowrap;
}
.app-grid-toolbar__search {
  flex: 0 1 396px;
  min-width: 0;
}
.app-grid-toolbar__actions {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  margin-left: auto;
}
@media (max-width: 600px) {
  .app-grid-toolbar {
    flex-wrap: wrap;
  }
  .app-grid-toolbar__search {
    flex: 1;
  }
}
</style>

<script setup lang="ts">
/**
 * AppGridToolbar — 应用中心/应用管理共用的搜索条。
 *
 * 左侧搜索框撑满可用宽度，右侧 actions 槽放页面级动作（如每行列数设置）。
 */
import { Search } from '@element-plus/icons-vue'

withDefaults(
  defineProps<{
    modelValue: string
    placeholder: string
    testId?: string
  }>(),
  { testId: 'app-grid-search' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: []
}>()
</script>

<template>
  <div class="app-grid-toolbar">
    <el-input
      class="app-grid-toolbar__search"
      :model-value="modelValue"
      :placeholder="placeholder"
      :prefix-icon="Search"
      clearable
      :data-testid="testId"
      @update:model-value="emit('update:modelValue', $event)"
      @keyup.enter="emit('search')"
      @clear="emit('search')"
    />
    <slot name="actions" />
  </div>
</template>

<style scoped>
.app-grid-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.app-grid-toolbar__search {
  flex: 1 1 auto;
  min-width: 0;
}
</style>

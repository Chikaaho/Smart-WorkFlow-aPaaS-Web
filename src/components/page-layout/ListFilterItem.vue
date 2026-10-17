<script setup lang="ts">
/**
 * ListFilterItem — 搜索栏字段块（0.1.7 #42）。
 * 在 ListFilterBar 的 12 格栅格中占 3 格：字段名 1 格 + 控件 2 格；
 * 日期、输入、选项等控件的宽度一律由栅格决定，页面不再写死 px 宽度。
 */
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="list-filter-item">
    <span class="list-filter-item__label" :title="label">{{ label }}</span>
    <div class="list-filter-item__control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.list-filter-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  align-items: center;
  gap: var(--sw-space-8);
  min-width: 0;
}
.list-filter-item__label {
  overflow: hidden;
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.list-filter-item__control {
  min-width: 0;
}
/* 控件吃满 2 格：任何控件都不再写死宽度 */
.list-filter-item__control :deep(.el-input),
.list-filter-item__control :deep(.el-select),
.list-filter-item__control :deep(.el-date-editor),
.list-filter-item__control :deep(.el-input-number) {
  width: 100%;
}
</style>

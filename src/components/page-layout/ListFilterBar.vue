<script setup lang="ts">
/**
 * ListFilterBar — 列表筛选区容器（0.1.7 #42：12 格栅格）。
 * 字段块（ListFilterItem）每块占 3 格：字段名 1 格 + 控件 2 格，每行最多 4 块；
 * 查询/重置按钮固定在行尾 3 格（每只 1.5 格，文字居中），字段多于 4 块时整块换行、按钮组始终靠右。
 * layout="inline" 保留行内 flex 排布，供批量操作条等非搜索场景使用。
 */
withDefaults(
  defineProps<{
    layout?: 'grid' | 'inline'
  }>(),
  { layout: 'grid' },
)
</script>

<template>
  <div class="list-filter-bar" :class="`list-filter-bar--${layout}`">
    <div class="list-filter-bar__fields">
      <slot />
      <div v-if="$slots.actions" class="list-filter-bar__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-filter-bar {
  padding: var(--sw-card-padding);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  background: #fff;
  margin-bottom: var(--sw-section-gap);
}

.list-filter-bar__fields {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--sw-space-12);
  align-items: center;
  min-width: 0;
}

/* 字段块固定 3 格（12 格 ÷ 每行最多 4 块）；整行内容用 __span-full */
:deep(.list-filter-bar__fields > *) {
  grid-column: span 3;
  min-width: 0;
}
:deep(.list-filter-bar__fields > .list-filter-bar__span-full) {
  grid-column: 1 / -1;
}
/* 按钮组钉在行尾 3 格：每只 1.5 格、文字居中；本行放不下时整组换行并仍靠右 */
:deep(.list-filter-bar__fields > .list-filter-bar__actions) {
  grid-column: 10 / span 3;
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
}
:deep(.list-filter-bar__actions .el-button) {
  flex: 1 1 0;
  min-width: 0;
  margin-left: 0;
}

/* layout="inline"：非搜索场景（批量操作条）沿用旧的行内排布 */
.list-filter-bar--inline .list-filter-bar__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sw-space-12);
}
</style>

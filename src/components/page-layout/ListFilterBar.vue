<script setup lang="ts">
/**
 * ListFilterBar — 列表筛选区容器。
 * 卡片态容器，筛选控件从默认 slot 进，查询/重置按钮从 #actions slot 进。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
defineProps<{}>()
</script>

<template>
  <div class="list-filter-bar">
    <div class="list-filter-bar__fields">
      <slot />
    </div>
    <div v-if="$slots.actions" class="list-filter-bar__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.list-filter-bar {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--sw-space-12);
  padding: var(--sw-card-padding);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  background: #fff;
  margin-bottom: var(--sw-section-gap);
}

.list-filter-bar__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sw-space-12);
  flex: 1;
  min-width: 0;
}

.list-filter-bar__actions {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  flex-shrink: 0;
}
</style>

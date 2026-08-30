<script setup lang="ts">
/**
 * ListToolbar — 表格上方工具栏。
 * 左侧：标题 + 记录数；右侧：操作按钮区（#actions slot）。
 */
defineProps<{ title?: string; total?: number }>()
</script>

<template>
  <div class="list-toolbar">
    <div class="list-toolbar__left">
      <slot>
        <h2 v-if="title" class="list-toolbar__title">{{ title }}</h2>
        <span v-if="total !== undefined" class="list-toolbar__total">共 {{ total }} 条记录</span>
      </slot>
    </div>
    <div v-if="$slots.actions" class="list-toolbar__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sw-space-16);
}

.list-toolbar__left {
  display: flex;
  align-items: baseline;
  gap: var(--sw-space-12);
}

.list-toolbar__title {
  margin: 0;
  font-size: var(--sw-font-h2);
  font-weight: var(--sw-font-weight-h2);
  color: var(--sw-text-primary);
}

.list-toolbar__total {
  font-size: var(--sw-font-secondary);
  font-weight: var(--sw-font-weight-secondary);
  color: var(--sw-text-secondary);
}

.list-toolbar__actions {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
}
</style>

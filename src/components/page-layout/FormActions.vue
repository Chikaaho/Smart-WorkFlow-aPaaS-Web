<script setup lang="ts">
/**
 * FormActions — 表单底部操作栏。
 * 顶边框分隔，默认右对齐。按钮由调用方从默认 slot 进。
 */
withDefaults(defineProps<{ align?: 'left' | 'right' }>(), { align: 'right' })
</script>

<template>
  <div :class="['form-actions', `form-actions--${align}`]">
    <slot />
  </div>
</template>

<style scoped>
.form-actions {
  display: flex;
  align-items: center;
  gap: var(--sw-space-12);
  padding: var(--sw-space-16) 0;
  border-top: 1px solid var(--sw-border-base);
  margin-top: var(--sw-space-16);
}

.form-actions--right {
  justify-content: flex-end;
}

.form-actions--left {
  justify-content: flex-start;
}
</style>

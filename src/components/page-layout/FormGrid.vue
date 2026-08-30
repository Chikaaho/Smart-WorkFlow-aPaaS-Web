<script setup lang="ts">
/**
 * FormGrid — 双列字段网格。
 * 只排版，不认识 FormSchema，不内置字段渲染。
 * 字段单元从默认 slot 进（决策 A：壳给槽，调用方塞内容）。
 */
withDefaults(defineProps<{ columns?: 1 | 2 }>(), { columns: 2 })
</script>

<template>
  <div :class="['form-grid', `form-grid--cols-${columns}`]">
    <slot />
  </div>
</template>

<style scoped>
.form-grid {
  display: grid;
  column-gap: var(--sw-space-32);
  row-gap: var(--sw-form-row-gap);
}

.form-grid--cols-2 {
  grid-template-columns: 1fr 1fr;
}

.form-grid--cols-1 {
  grid-template-columns: 1fr;
}
</style>

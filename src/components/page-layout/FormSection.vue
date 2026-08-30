<script setup lang="ts">
/**
 * FormSection — 表单分区卡片。
 * 壳：圆角6px + 卡片阴影 + 内边距，分组标题用主色下边框分隔。
 * 数据外部进（title prop），内容从默认 slot 进。
 */
defineProps<{ title?: string }>()
</script>

<template>
  <section class="form-section">
    <div v-if="title || $slots.title" class="form-section__header">
      <slot name="title">
        <h2 class="form-section__title">{{ title }}</h2>
      </slot>
    </div>
    <div class="form-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.form-section {
  background: #fff;
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  padding: var(--sw-card-padding);
  margin-bottom: var(--sw-section-gap);
}

.form-section__header {
  padding-bottom: var(--sw-space-12);
  margin-bottom: var(--sw-space-16);
  border-bottom: 1px solid var(--sw-color-primary);
}

.form-section__title {
  margin: 0;
  font-size: var(--sw-font-h2);
  font-weight: var(--sw-font-weight-h2);
  color: var(--sw-color-primary);
}
</style>

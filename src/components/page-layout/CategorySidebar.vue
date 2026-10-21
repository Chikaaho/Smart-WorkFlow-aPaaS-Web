<script setup lang="ts">
/**
 * CategorySidebar — 分类侧栏面板外壳。
 *
 * 表单管理与流程中心共用同一套面板外观（卡片、内距、滚动、标题排版）；
 * 面板内容由宿主决定：表单管理放 el-tree，流程中心放任一扁平列表。
 * fill：撑满栅格行高（树在面板内滚动）；sticky：随页面滚动吸附顶部。
 */
withDefaults(
  defineProps<{
    title?: string
    /** 撑满父级栅格行高，内容超出时面板内滚动 */
    fill?: boolean
    /** 滚动时吸附在内容区顶部 */
    sticky?: boolean
  }>(),
  { fill: false, sticky: false, title: undefined },
)
</script>

<template>
  <aside
    class="category-sidebar"
    :class="{
      'category-sidebar--fill': fill,
      'category-sidebar--sticky': sticky,
    }"
  >
    <p v-if="title" class="category-sidebar__title">{{ title }}</p>
    <slot />
  </aside>
</template>

<style scoped>
.category-sidebar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: var(--sw-surface-card);
  box-shadow: var(--sw-shadow-card);
  overflow: auto;
}

.category-sidebar--fill {
  align-self: stretch;
  min-height: 0;
}

.category-sidebar--sticky {
  position: sticky;
  top: 12px;
}

.category-sidebar__title {
  margin: 0 0 8px;
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-primary);
}
</style>

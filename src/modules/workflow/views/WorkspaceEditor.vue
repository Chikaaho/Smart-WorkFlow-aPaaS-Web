<script setup lang="ts">
/**
 * WorkspaceEditor — 工作台编辑页（/workspace/edit，v0.1.1 BUG-002）。
 * 整页自由画布：组件库、拖拽定位、悬停缩放、对齐吸附虚线；退出返回工作台。
 */
import WorkspaceBoard from '@/modules/workflow/components/WorkspaceBoard.vue'
</script>

<template>
  <WorkspaceBoard editable />
</template>

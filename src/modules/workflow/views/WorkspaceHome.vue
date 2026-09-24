<script setup lang="ts">
/**
 * WorkspaceHome — 工作台首页（v0.1.1 BUG-002）。
 * 只读渲染画布；编辑能力由独立页面 /workspace/edit 承载，齿轮跳转。
 */
import WorkspaceBoard from '@/modules/workflow/components/WorkspaceBoard.vue'
</script>

<template>
  <WorkspaceBoard />
</template>

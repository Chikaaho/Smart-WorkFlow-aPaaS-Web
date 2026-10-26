<script setup lang="ts">
/**
 * WorkspaceHome — 工作台首页（v0.1.1 BUG-002 / 0.2.0 r2）。
 * 只读渲染真实画布；齿轮进入全屏三栏配置 /workspace/config。
 * 旧 /workspace/edit 与居中配置弹窗组件保留兼容，不再作为首页入口。
 */
import WorkspaceBoard from '@/modules/workflow/components/WorkspaceBoard.vue'
</script>

<template>
  <div class="workspace-home">
    <WorkspaceBoard />
  </div>
</template>

<style scoped>
.workspace-home {
  width: 100%;
}
</style>

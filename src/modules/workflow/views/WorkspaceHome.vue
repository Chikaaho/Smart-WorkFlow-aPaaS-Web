<script setup lang="ts">
/**
 * WorkspaceHome — 工作台首页（v0.1.1 BUG-002）。
 * 只读渲染画布；齿轮按 273:1600 打开居中「配置工作台」弹窗，
 * 旧全屏编辑路由 /workspace/edit 保持可达（历史入口与用户配置兼容）。
 */
import { ref } from 'vue'
import WorkspaceBoard from '@/modules/workflow/components/WorkspaceBoard.vue'
import WorkspaceConfigDialog from '@/modules/workflow/components/WorkspaceConfigDialog.vue'

const configVisible = ref(false)
</script>

<template>
  <div class="workspace-home">
    <WorkspaceBoard config-via-dialog @configure="configVisible = true" />
    <WorkspaceConfigDialog v-model:visible="configVisible" />
  </div>
</template>

<style scoped>
.workspace-home {
  width: 100%;
}
</style>

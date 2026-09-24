<script setup lang="ts">
/**
 * WorkspaceEditor — 工作台编辑页（/workspace/edit，v0.1.1 BUG-002）。
 * 顶层独立全屏路由：不套主布局壳。所见即所得编辑 —— 画布渲染与首页完全
 * 相同的真实卡片（WorkspaceBoard editable 态），左侧组件选择栏对齐表单
 * 设计器风格；保存后主页按所摆几何渲染。
 */
import WorkspaceBoard from '@/modules/workflow/components/WorkspaceBoard.vue'
</script>

<template>
  <WorkspaceBoard editable />
</template>

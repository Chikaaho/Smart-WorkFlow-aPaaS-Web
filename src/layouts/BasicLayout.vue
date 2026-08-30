<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'
import AppLogo from './components/AppLogo.vue'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'

// 根布局（常量路由 app-root）：侧边栏 + 顶栏 + 内容区。动态业务路由由 router/guard 挂为其子路由。
const appStore = useAppStore()
const collapsed = computed(() => appStore.sidebarCollapsed)
</script>

<template>
  <el-container class="basic-layout">
    <el-aside
      class="basic-layout__aside"
      :width="collapsed ? 'var(--sw-layout-aside-width-collapsed)' : 'var(--sw-layout-aside-width)'"
    >
      <AppLogo :collapse="collapsed" />
      <AppSidebar class="basic-layout__menu" :collapse="collapsed" />
    </el-aside>
    <el-container>
      <el-header class="basic-layout__header" :height="'var(--sw-layout-header-height)'">
        <AppTopbar />
      </el-header>
      <el-main class="basic-layout__content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.basic-layout {
  height: 100vh;
}
.basic-layout__aside {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-light);
  transition: width 0.2s ease;
  overflow: hidden;
}
.basic-layout__menu {
  flex: 1;
  overflow-y: auto;
}
.basic-layout__header {
  display: flex;
  align-items: center;
  padding: 0 var(--sw-layout-header-padding-x);
  border-bottom: 1px solid var(--el-border-color-light);
}
.basic-layout__content {
  background: var(--el-bg-color-page);
}
</style>

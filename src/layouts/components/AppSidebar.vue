<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMenuStore } from '@/stores/menu'
import { resolveArea } from '@/foundation/area'
import { visibleMenuForArea, openedMenuKeys } from '../menu-utils'
import { useLocalizedMenuTree } from '../menu-title'
import AppSidebarItem from './AppSidebarItem.vue'

// 侧边栏（P53 深色导航阶）：只读 menu store（单一数据源），不二次拉取。
// 选中态与展开态随当前路由派生；只渲染当前区域（前台/后台）的菜单分支。
defineProps<{ collapse: boolean }>()

const route = useRoute()
const menuStore = useMenuStore()

const localizedMenu = useLocalizedMenuTree(computed(() => menuStore.menu))
const items = computed(() => visibleMenuForArea(localizedMenu.value, resolveArea(route.path)))
const activePath = computed(() => route.path)
const openeds = computed(() => openedMenuKeys(menuStore.menu, route.path))
</script>

<template>
  <el-menu
    class="app-sidebar"
    router
    :collapse="collapse"
    :default-active="activePath"
    :default-openeds="openeds"
  >
    <AppSidebarItem v-for="node in items" :key="node.id" :node="node" />
  </el-menu>
</template>

<style scoped>
.app-sidebar {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--sw-nav-text-secondary);
  --el-menu-hover-text-color: var(--sw-nav-text);
  --el-menu-hover-bg-color: var(--sw-nav-hover-bg);
  --el-menu-active-color: var(--sw-nav-text);
  --el-menu-border-color: transparent;
  --el-menu-item-height: 44px;
  border-right: none;
}
.app-sidebar:not(.el-menu--collapse) {
  width: 100%;
}
.app-sidebar :deep(.el-menu-item) {
  margin: 2px 8px;
  border-radius: var(--sw-radius-base);
}
.app-sidebar :deep(.el-menu-item.is-active) {
  background: var(--sw-color-primary);
  color: #ffffff;
  font-weight: 500;
}
/* 设计（节点04）：二级子项激活块为深紫蓝 #29235C，顶级激活保持品牌紫 */
.app-sidebar :deep(.el-menu--inline .el-menu-item.is-active) {
  background: var(--sw-nav-subitem-active-bg);
}
.app-sidebar :deep(.el-sub-menu__title) {
  margin: 2px 8px;
  border-radius: var(--sw-radius-base);
}
.app-sidebar :deep(.el-sub-menu.is-active > .el-sub-menu__title) {
  color: var(--sw-nav-text);
}
.app-sidebar :deep(.el-menu-item:hover),
.app-sidebar :deep(.el-sub-menu__title:hover) {
  background: var(--sw-nav-hover-bg);
}
</style>

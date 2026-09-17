<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMenuStore } from '@/stores/menu'
import { resolveArea } from '@/foundation/area'
import { visibleMenuForArea, openedMenuKeys } from '../menu-utils'
import { useLocalizedMenuTree } from '../menu-title'
import AppSidebarItem from './AppSidebarItem.vue'
import { activeDesignFixtureFlag } from '@/foundation/design-fixture-flag'
import { ArrowRight } from '@element-plus/icons-vue'

// 侧边栏（P53 深色导航阶）：只读 menu store（单一数据源），不二次拉取。
// 选中态与展开态随当前路由派生；只渲染当前区域（前台/后台）的菜单分支。
defineProps<{ collapse: boolean }>()

const route = useRoute()
const menuStore = useMenuStore()

const localizedMenu = useLocalizedMenuTree(computed(() => menuStore.menu))
const items = computed(() => visibleMenuForArea(localizedMenu.value, resolveArea(route.path)))
const activePath = computed(() => route.path)
const openeds = computed(() => openedMenuKeys(menuStore.menu, route.path))
// P53 DESIGN_FIDELITY：fixture 会话在侧栏首项渲染工作台入口（真实常量路由，不新增菜单事实源）。
const designFixture = activeDesignFixtureFlag()
</script>

<template>
  <el-menu
    class="app-sidebar"
    router
    :collapse="collapse"
    :default-active="activePath"
    :default-openeds="openeds"
  >
    <el-menu-item v-if="designFixture" index="/workspace">{{
      $t('common.workspace')
    }}</el-menu-item>
    <AppSidebarItem v-for="node in items" :key="node.id" :node="node" />
    <div v-if="designFixture" class="app-sidebar__design-extra" aria-hidden="true">
      <span>智能能力</span>
      <el-icon :size="12"><arrow-right /></el-icon>
    </div>
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
  padding-top: 20px;
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
/* 设计（节点01）：二级子项为描边盒子（36px 高、左右 16px 边距、4px 间隔） */
.app-sidebar :deep(.el-menu--inline .el-menu-item) {
  height: 36px;
  margin: 4px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
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
/* 设计（节点01）：智能能力折叠组占位（fixture 会话） */
.app-sidebar__design-extra {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  margin: 24px 8px 2px;
  padding: 0 16px;
  border-radius: var(--sw-radius-base);
  color: var(--sw-nav-text);
  font-size: 14px;
}
</style>

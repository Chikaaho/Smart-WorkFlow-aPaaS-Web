<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMenuStore } from '@/stores/menu'
import { resolveArea } from '@/foundation/area'
import { visibleMenuForArea, openedMenuKeys } from '../menu-utils'
import AppSidebarItem from './AppSidebarItem.vue'

// 侧边栏：只读 menu store（单一数据源），不二次拉取。选中态与展开态随当前路由派生。
// v0.0.2 P55：只渲染当前区域（前台/后台）的菜单分支，前后台导航分离。
defineProps<{ collapse: boolean }>()

const route = useRoute()
const menuStore = useMenuStore()

const items = computed(() => visibleMenuForArea(menuStore.menu, resolveArea(route.path)))
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
  border-right: none;
}
.app-sidebar:not(.el-menu--collapse) {
  width: 100%;
}
</style>

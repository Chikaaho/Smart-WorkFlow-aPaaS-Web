<script setup lang="ts">
import { MenuType, type MenuNode } from '@/contracts/menu'
import { toFullPath } from '../menu-utils'
import { menuIcon } from '../menu-icons'

// 递归菜单项：目录 → el-sub-menu（可展开），菜单 → el-menu-item（点击经 el-menu router 模式导航）。
defineProps<{ node: MenuNode }>()
</script>

<template>
  <el-sub-menu
    v-if="node.menuType === MenuType.DIRECTORY && node.children?.length"
    :index="toFullPath(node)"
  >
    <template #title>
      <el-icon v-if="menuIcon(node.icon)"><component :is="menuIcon(node.icon)" /></el-icon>
      <span>{{ node.title }}</span>
    </template>
    <AppSidebarItem v-for="child in node.children" :key="child.id" :node="child" />
  </el-sub-menu>
  <el-menu-item v-else :index="toFullPath(node)">
    <el-icon v-if="menuIcon(node.icon)"><component :is="menuIcon(node.icon)" /></el-icon>
    <template #title>{{ node.title }}</template>
  </el-menu-item>
</template>

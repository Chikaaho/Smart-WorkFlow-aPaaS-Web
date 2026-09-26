<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMenuStore } from '@/stores/menu'
import { resolveArea } from '@/foundation/area'
import { visibleMenuForArea, toFullPath } from '../menu-utils'
import { useLocalizedMenuTree } from '../menu-title'
import { MenuType, type MenuNode } from '@/contracts/menu'
import AppSidebarItem from './AppSidebarItem.vue'
import iconWorkspace from '@/assets/brand/icon-workspace.png'
import iconIntelligence from '@/assets/brand/icon-intelligence.png'

// 侧边栏（P53 深色导航阶）：只读 menu store（单一数据源），不二次拉取。
// 选中态与展开态随当前路由派生；只渲染当前区域（前台/后台）的菜单分支。
const props = defineProps<{ collapse: boolean }>()

const route = useRoute()
const menuStore = useMenuStore()
void props

const localizedMenu = useLocalizedMenuTree(computed(() => menuStore.menu))

const area = computed(() => resolveArea(route.path))

/**
 * 工作台页轻量导航（V012-BUG-004）：/workspace 下侧栏仅保留 待办/已办/草稿
 * 三个直达项（工作台固定项另渲染）。仍只读菜单单一数据源——从当前区域树中
 * 按路径平铺挑出目标页面节点，不二次拉取、不另设菜单源。
 */
const WORKSPACE_SLIM_PATHS: ReadonlySet<string> = new Set([
  '/workflow/todo',
  '/workflow/processed',
  '/workflow/my-drafts',
])
const workspaceSlim = computed(() => area.value === 'portal' && route.path.startsWith('/workspace'))

function flattenByPaths(nodes: MenuNode[], paths: ReadonlySet<string>): MenuNode[] {
  const picked: MenuNode[] = []
  const walk = (list: MenuNode[]): void => {
    for (const node of list) {
      if (node.menuType === MenuType.MENU && paths.has(toFullPath(node))) picked.push(node)
      if (node.children?.length) walk(node.children as MenuNode[])
    }
  }
  walk(nodes)
  return picked
}

/**
 * 后台侧栏按**顶部导航分区**收敛：只渲染当前分区（与顶栏同一份菜单数据）。
 * 顶栏进入「系统管理」时，侧栏不应再出现「流程管理」等其它分区的页面。
 * 前台（portal）保持原有派生（工作台 + 流程中心 + 收件箱等跨入口），不做分区收敛。
 */
const items = computed(() => {
  const current = resolveArea(route.path)
  const scoped = visibleMenuForArea(localizedMenu.value, current)
  if (current !== 'admin') {
    // 工作台页轻量导航（V012-BUG-004）
    if (workspaceSlim.value) return flattenByPaths(scoped, WORKSPACE_SLIM_PATHS)
    return scoped
  }
  // 按「子树是否覆盖当前路由」定位分区：不能只看首段路径——
  // 开放接口(/openapi)、文件管理(/storage) 等已并入系统管理，首段与分组路径不一致，
  // 按首段匹配会找不到分组而回退成整棵树（表现为「点开放接口后所有分组又都展开了」）。
  const group = scoped.find((node) => subtreeContains(node, route.path))
  if (!group) return scoped
  return group.children?.length ? group.children : [group]
})

/** 节点自身或其任一后代页面路径是否覆盖当前路由（相等或为其前缀）。 */
function subtreeContains(node: MenuNode, path: string): boolean {
  const full = toFullPath(node)
  if (path === full || path.startsWith(`${full}/`)) return true
  return (node.children ?? []).some((child) => subtreeContains(child, path))
}
// 深链上下文激活映射（设计节点03/27）：表单渲染→流程中心；任务详情→我的待办
const activePath = computed(() => {
  if (route.path.startsWith('/form/form-render/')) return '/workflow/catalog'
  if (route.path.startsWith('/workflow/task/')) return '/workflow/todo'
  // 详情页高亮到所属菜单项（如 /form/designer/:id → 表单设计）
  return resolveAdminActive(route.path) || route.path
})
// 任务/数据详情帧（设计02/03/19/20）：二级激活描边为暗调 #344164，非品牌紫
const detailFrame = computed(
  () =>
    route.path.startsWith('/workflow/task/') ||
    route.path.startsWith('/workflow/my-instances') ||
    route.path.startsWith('/workflow/todo') ||
    route.path.startsWith('/workflow/my-cc'),
)
const taskDetailFrame = computed(() => route.path.startsWith('/workflow/task/'))
// 设计（节点01/02/04）：导航分组默认全展开，保持完整可达路径可见。
const openeds = computed(() => {
  const keys: string[] = []
  const walk = (nodes: ReturnType<typeof visibleMenuForArea>): void => {
    for (const node of nodes) {
      if (node.menuType === MenuType.DIRECTORY) keys.push(toFullPath(node))
      if (node.children?.length) walk(node.children as ReturnType<typeof visibleMenuForArea>)
    }
  }
  walk(items.value)
  return keys
})

/** 详情页（如 /form/designer/:id、/workflow/defs/:id/design）高亮到所属菜单项。 */
function resolveAdminActive(path: string): string {
  let matched = ''
  const walk = (nodes: ReturnType<typeof visibleMenuForArea>): void => {
    for (const node of nodes) {
      const full = toFullPath(node)
      if (node.menuType === MenuType.MENU && (path === full || path.startsWith(`${full}/`))) {
        if (full.length > matched.length) matched = full
      }
      if (node.children?.length) walk(node.children as ReturnType<typeof visibleMenuForArea>)
    }
  }
  walk(items.value)
  return matched
}
</script>

<template>
  <el-menu
    class="app-sidebar"
    :class="[
      `app-sidebar--${area}`,
      {
        'app-sidebar--detail': detailFrame,
        'app-sidebar--task-detail': taskDetailFrame,
        'app-sidebar--catalog': activePath.startsWith('/workflow/catalog'),
      },
    ]"
    router
    :collapse="collapse"
    :default-active="activePath"
    :default-openeds="openeds"
  >
    <el-menu-item v-if="area === 'portal'" index="/workspace">
      <img class="app-sidebar__design-icon" :src="iconWorkspace" alt="" aria-hidden="true" />
      <template #title>{{ $t('common.workspace') }}</template>
    </el-menu-item>
    <AppSidebarItem
      v-for="node in items"
      :key="node.id"
      :node="node"
      :task-detail="taskDetailFrame"
    />
    <div
      v-if="area === 'portal' && !workspaceSlim"
      class="app-sidebar__design-extra"
      aria-hidden="true"
    >
      <img class="app-sidebar__design-icon" :src="iconIntelligence" alt="" aria-hidden="true" />
      <span class="app-sidebar__design-extra-label" style="margin-left: 2px">
        {{ $t('nav.intelligenceSuite') }}
      </span>
    </div>
    <div v-else-if="area === 'admin'" class="app-sidebar__design-note" aria-hidden="true">
      {{ $t('nav.permissionFootnote') }}
    </div>
  </el-menu>
</template>

<style scoped>
.app-sidebar {
  --el-menu-bg-color: transparent;
  --sw-nav-text-secondary: #c9d1e8;
  --el-menu-text-color: var(--sw-nav-text-secondary);
  --el-menu-hover-text-color: var(--sw-nav-text);
  --el-menu-hover-bg-color: var(--sw-nav-hover-bg);
  --el-menu-active-color: var(--sw-nav-text);
  --el-menu-border-color: transparent;
  /* 设计（节点02）：侧栏导航 x=12 起、项高 40、顶部留 18px */
  --el-menu-item-height: 40px;
  --el-menu-base-level-padding: 13px;
  padding-top: 18px;
  border-right: none;
}
.app-sidebar--portal {
  --sw-nav-subitem-active-bg: #29235c;
}
.app-sidebar--detail {
  --sw-nav-subitem-active-bg: #29235c;
}
.app-sidebar--catalog {
  --sw-nav-subitem-active-bg: #282052;
  --sw-nav-text-secondary: #c8d0e0;
}
.app-sidebar--portal :deep(.el-menu--inline > .el-menu-item:nth-child(2)) {
  transform: translateY(1px);
}
.app-sidebar--portal :deep(.el-menu--inline > .el-menu-item:nth-child(3)) {
  transform: translateY(2px);
}
.app-sidebar--portal :deep(.el-menu--inline > .el-menu-item:nth-child(4)) {
  transform: translateY(3px);
}
.app-sidebar:not(.el-menu--collapse) {
  width: 100%;
}
/* 一级项与组标题：整行可选区（V012-BUG-005 去边框），左右 12px 边距；图标 20 + 12px 文距 */
.app-sidebar :deep(> .el-menu-item),
.app-sidebar :deep(> .el-sub-menu > .el-sub-menu__title) {
  height: 40px;
  line-height: 18px;
  margin: 0 12px;
  border: none;
  border-radius: var(--sw-radius-base);
}
.app-sidebar :deep(> .el-menu-item .el-icon),
.app-sidebar :deep(> .el-sub-menu > .el-sub-menu__title .el-icon) {
  width: 20px;
  height: 20px;
  font-size: 20px;
  margin-right: 12px;
  color: var(--sw-nav-text-secondary);
}
/* 设计（节点02）：组展开箭头为固定向下 chevron（不随展开态旋转），右缘 12px */
.app-sidebar :deep(.el-sub-menu__icon-arrow) {
  display: none;
}
.app-sidebar :deep(> .el-sub-menu > .el-sub-menu__title) {
  position: relative;
}
.app-sidebar :deep(> .el-sub-menu > .el-sub-menu__title)::after {
  content: '';
  position: absolute;
  right: 12px;
  top: 50%;
  width: 16px;
  height: 16px;
  transform: translateY(-50%);
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6L8 10L12 6' stroke='%238690AE' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    no-repeat center / contain;
}
.app-sidebar :deep(.app-sidebar__design-icon) {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  margin-right: 12px;
}
.app-sidebar :deep(.el-menu-item > span),
.app-sidebar :deep(.el-sub-menu__title > span),
.app-sidebar__design-extra-label {
  position: relative;
  top: -1.5px;
}
/* 设计（节点02）：一级项之间 12px 间隔 */
.app-sidebar :deep(> .el-menu-item) {
  margin-bottom: 12px;
}
.app-sidebar :deep(.el-menu-item.is-active) {
  background: var(--sw-color-primary);
  color: #ffffff;
  font-weight: 500;
}
/* 设计（节点04）：二级子项激活块为深紫蓝 #29235C，顶级激活保持品牌紫（V012-BUG-005 去描边） */
.app-sidebar :deep(.el-menu--inline .el-menu-item.is-active) {
  background: var(--sw-nav-subitem-active-bg);
}
.app-sidebar--task-detail :deep(.el-menu--inline .el-menu-item > span) {
  top: -1.5px;
}
.app-sidebar--task-detail :deep(.el-menu--inline .el-menu-item) {
  line-height: 17px !important;
}
/* 设计（节点02）：二级子项为整行可选区（36px 高、左 48/右 12 对齐、2px 间隔、无图标；V012-BUG-005 去描边） */
.app-sidebar :deep(.el-menu--inline) {
  position: relative;
  background: transparent;
  width: 100%;
  padding: 3px 0 13px;
}
.app-sidebar :deep(.el-menu--inline)::before {
  content: '';
  position: absolute;
  left: 36px;
  top: 2px;
  bottom: 21px;
  width: 1px;
  background: #354164;
}
.app-sidebar :deep(.el-menu--inline .el-menu-item) {
  height: 36px;
  line-height: 17px;
  margin: 1px 12px 1px 48px;
  padding-left: 17px;
  border-radius: var(--sw-radius-base);
}
.app-sidebar :deep(.el-menu--inline .el-menu-item .el-icon) {
  display: none;
}
.app-sidebar :deep(.el-menu-item:hover),
.app-sidebar :deep(.el-sub-menu__title:hover) {
  background: var(--sw-nav-hover-bg);
}
/* 设计（节点02）：智能能力折叠组占位（前台常驻标脚，非交互装饰；V012-BUG-005 去边框） */
.app-sidebar__design-extra {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 40px;
  transform: translateY(3px);
  margin: 0 12px;
  padding: 0 0 0 13px;
  border-radius: var(--sw-radius-base);
  color: #c9d1e8;
  font-size: 14px;
}
.app-sidebar__design-extra-icon {
  color: var(--sw-nav-text-secondary);
}

.app-sidebar__design-extra::after {
  content: '';
  margin-left: auto;
  margin-right: 13px;
  width: 16px;
  height: 16px;
  transform: rotate(-90deg);
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6L8 10L12 6' stroke='%238690AE' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    no-repeat center / contain;
}
/* 设计（节点04）：后台权限说明注脚（后台常驻） */
.app-sidebar__design-note {
  /* 设计（节点04）：辅助说明 x=20 */
  margin: 10px 12px 0 20px;
  color: var(--sw-nav-text-secondary);
  font-size: 12px;
}
/* 设计（节点04）：管理端侧栏变体——组/子项贴右缘 224，子项 176×36 连排，组间 12（V012-BUG-005 去边框） */
.app-sidebar--admin :deep(> .el-sub-menu > .el-sub-menu__title) {
  width: 212px;
  margin: 0 0 0 12px;
}

.app-sidebar--admin :deep(.el-menu--inline) {
  padding: 4px 0 12px;
}
.app-sidebar--admin :deep(.el-menu--inline .el-menu-item) {
  width: 176px;
  margin: 0 0 0 48px;
}
</style>

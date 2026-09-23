<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '@/locales'
import { useMenuStore } from '@/stores/menu'
import { filterMenuByArea, resolveArea } from '@/foundation/area'
import { visibleMenuForArea, toFullPath, buildMenuTrail } from './menu-utils'
import { useLocalizedMenuTree } from './menu-title'
import { MenuType } from '@/contracts/menu'
import type { MenuNode } from '@/contracts/menu'

/**
 * 顶部主导航（P53 设计节点 01/04）。
 *
 * 条目全部来自真实可达路由，不造空入口（方向 §4.3）：
 * - 菜单树节点带 topbar 投影序号时（服务端可下发），按序进入顶栏：叶子取自身
 *   路由，目录取首个可见叶子的路由——顶栏与侧栏是同一份菜单数据的两种投影；
 * - 无投影数据时走默认派生：
 *   - portal：工作台（常量路由）+ 菜单树中真实存在的流程中心 / 消息收件箱入口；
 *   - admin：服务端下发菜单的顶层分组，点击进入该分组注册的首叶 redirect。
 * 数据只读 menu store（单一数据源），可达性以服务端过滤后的树为准。
 */

interface MainNavItem {
  key: string
  label: string
  to: string
  active: boolean
}

const route = useRoute()
const menuStore = useMenuStore()
const { t } = useI18n()

const localizedMenu = useLocalizedMenuTree(computed(() => menuStore.menu))
const area = computed(() => resolveArea(route.path))

/** 顶栏投影收集源：区域过滤后的树（保留 hidden 节点——hidden 仅表示侧栏不渲染，顶栏投影仍生效）。 */
const areaMenu = computed(() => filterMenuByArea(localizedMenu.value, area.value))

/** 目录 → 首个可见叶子；叶子 → 自身（动态路由按菜单原始 path 扁平注册）。 */
function topbarTarget(node: MenuNode): string | null {
  if (node.menuType !== MenuType.DIRECTORY) return toFullPath(node)
  const first = visibleMenuNode(node)
  return first ? toFullPath(first) : null
}

function visibleMenuNode(node: MenuNode): MenuNode | null {
  if (node.menuType === MenuType.BUTTON || node.hidden) return null
  if (node.menuType !== MenuType.DIRECTORY) return node
  for (const child of node.children ?? []) {
    const found = visibleMenuNode(child)
    if (found) return found
  }
  return null
}

/** 收集全树中带 topbar 投影序号的节点（含 hidden——hidden 只约束侧栏），按序号升序展开。 */
function collectTopbarItems(nodes: MenuNode[], into: MainNavItem[]): void {
  const flagged: Array<{ order: number; node: MenuNode }> = []
  const walk = (list: MenuNode[]): void => {
    for (const node of list) {
      if (node.menuType !== MenuType.BUTTON && node.topbar != null) {
        flagged.push({ order: node.topbar, node })
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  flagged.sort((a, b) => a.order - b.order)
  for (const { node } of flagged) {
    const to = topbarTarget(node)
    if (!to) continue
    into.push({ key: node.id, label: node.title, to, active: isActive(to) })
  }
}

/** 顶栏激活态：当前路由落在条目子树内；流程中心额外覆盖任务/发起深链。 */
function isActive(to: string): boolean {
  if (
    to === '/workflow/defs' &&
    route.path.startsWith('/form/designer/') &&
    route.query.tab === 'processes'
  ) {
    return true
  }
  if (to === '/workflow/catalog') {
    return (
      route.path === '/workflow/catalog' ||
      route.path.startsWith('/workflow/catalog/') ||
      route.path.startsWith('/workflow/task/') ||
      route.path.startsWith('/workflow/my-tasks') ||
      route.path.startsWith('/workflow/processed') ||
      route.path.startsWith('/form/form-render/') ||
      (route.path.startsWith('/form/designer/') && route.query.tab === 'processes')
    )
  }
  // P53：表单设计器工作台（/form/designer/:id）属于「表单管理」子树深链
  if (to === '/form/form-def-list') {
    return (
      route.path === to ||
      (route.path.startsWith('/form/') &&
        !(route.path.startsWith('/form/designer/') && route.query.tab === 'processes'))
    )
  }
  if (to === '/workflow/analytics') {
    return (
      route.path === to ||
      route.path.startsWith(`${to}/`) ||
      route.path.startsWith('/workflow/my-instances')
    )
  }
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}

const items = computed<MainNavItem[]>(() => {
  const visible = visibleMenuForArea(localizedMenu.value, area.value)
  if (area.value === 'portal') {
    const result: MainNavItem[] = [
      {
        key: 'workspace',
        label: t('common.workspace'),
        to: '/workspace',
        active: route.path === '/workspace',
      },
    ]
    const before = result.length
    collectTopbarItems(areaMenu.value, result)
    if (result.length > before) return result
    // 默认派生（服务端未下发顶栏投影时）：门户常量 + 菜单树真实入口。
    result.push({
      key: 'portal',
      label: t('portal.navLabel'),
      to: '/portal',
      active: route.path === '/portal',
    })
    const paths = new Set<string>()
    collectPaths(visible, paths)
    if (paths.has('/workflow/catalog')) {
      result.push({
        key: 'process-catalog',
        label: t('workflow.processCenter'),
        to: '/workflow/catalog',
        active: isActive('/workflow/catalog'),
      })
    }
    if (paths.has('/notify/inbox')) {
      result.push({
        key: 'notify-inbox',
        label: t('menu.notifyInbox'),
        to: '/notify/inbox',
        active: route.path === '/notify/inbox',
      })
    }
    return result
  }
  const before: MainNavItem[] = []
  collectTopbarItems(areaMenu.value, before)
  if (before.length) return before
  // 默认派生：管理端顶层分组 → **该分组内首个后台可见叶子**（绝对路径）。
  // 不指向分组自身 path：目录只注册了 redirect，且分组里可能混有前台叶子
  // （如「流程管理」下的待办任务），点分组会落到前台页或不存在的位置。
  const trail = buildMenuTrail(visible, route.path)
  const navItems: MainNavItem[] = []
  for (const node of visible) {
    if (node.menuType === MenuType.BUTTON) continue
    const to = node.menuType === MenuType.DIRECTORY ? firstVisibleLeaf(node) : toFullPath(node)
    if (!to) continue
    navItems.push({
      key: node.id,
      label: node.title,
      to,
      active: trail.length > 0 && trail[0]!.id === node.id,
    })
  }
  return navItems
})

/** 目录 → 首个后台可见叶子的绝对路径（无可用叶子返回 null）。 */
function firstVisibleLeaf(node: MenuNode): string | null {
  const leaf = visibleMenuNode(node)
  return leaf ? toFullPath(leaf) : null
}

function collectPaths(nodes: MenuNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(toFullPath(node))
    if (node.children?.length) collectPaths(node.children, into)
  }
}
</script>

<template>
  <nav class="app-main-nav" :class="[`app-main-nav--${area}`]" :aria-label="t('nav.mainNav')">
    <router-link
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      class="app-main-nav__item"
      :class="{ 'is-active': item.active }"
    >
      <span class="app-main-nav__label">{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.app-main-nav {
  display: flex;
  align-items: stretch;
  height: 100%;
  min-width: 0;
  /* 窄屏顶栏放不下全部主导航时横向滑动，保证每一项可点（方向 §4.5：不留不可操作元素） */
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.app-main-nav--portal {
  --sw-nav-topbar-active-bg: var(--sw-nav-topbar-portal-active-bg);
}
.app-main-nav--admin {
  --sw-nav-topbar-active-bg: var(--sw-nav-topbar-admin-active-bg);
}
.app-main-nav::-webkit-scrollbar {
  display: none;
}
.app-main-nav__item {
  position: relative;
  display: inline-flex;
  flex: 0 0 144px;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--sw-nav-topbar-text);
  text-decoration: none;
  white-space: nowrap;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}
.app-main-nav__item:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}
.app-main-nav__item.is-active {
  color: #ffffff;
  font-weight: 600;
  background: var(--sw-nav-topbar-active-bg);
}
.app-main-nav--admin .app-main-nav__item {
  flex: 1 1 0;
  min-width: 88px;
  padding: 0 12px;
}
/* 设计（节点02）：当前栏目指示线 48×2，居中（PNG 墨迹行 61-62） */
.app-main-nav__item.is-active::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 1px;
  width: 48px;
  height: 2px;
  transform: translateX(-50%);
  background: var(--sw-nav-topbar-active-indicator);
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '@/locales'
import { useMenuStore } from '@/stores/menu'
import { resolveArea } from '@/foundation/area'
import { visibleMenuForArea, toFullPath, buildMenuTrail } from './menu-utils'
import { useLocalizedMenuTree } from './menu-title'
import { MenuType } from '@/contracts/menu'
import type { MenuNode } from '@/contracts/menu'

/**
 * 顶部主导航（P53 设计节点 01/04）。
 *
 * 条目全部来自真实可达路由，不造空入口（方向 §4.3）：
 * - portal：工作台（常量路由）+ 菜单树中真实存在的流程中心 / 消息收件箱入口；
 * - admin：服务端下发菜单的顶层分组，点击进入该分组注册的首叶 redirect。
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

function collectPaths(nodes: MenuNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(toFullPath(node))
    if (node.children?.length) collectPaths(node.children, into)
  }
}

const items = computed<MainNavItem[]>(() => {
  const visible = visibleMenuForArea(localizedMenu.value, area.value)
  if (area.value === 'portal') {
    const paths = new Set<string>()
    collectPaths(visible, paths)
    const result: MainNavItem[] = [
      {
        key: 'workspace',
        label: t('common.workspace'),
        to: '/workspace',
        active: route.path === '/workspace',
      },
    ]
    // 门户是常量路由（登录即可达），不依赖菜单树下发。
    result.push({
      key: 'portal',
      label: t('portal.navLabel'),
      to: '/portal',
      active: route.path === '/portal',
    })
    if (paths.has('/workflow/catalog')) {
      result.push({
        key: 'process-catalog',
        label: t('workflow.processCenter'),
        to: '/workflow/catalog',
        active: route.path === '/workflow/catalog' || route.path.startsWith('/workflow/catalog/'),
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
  const trail = buildMenuTrail(visible, route.path)
  return visible
    .filter((node) => node.menuType !== MenuType.BUTTON)
    .map((node) => ({
      key: node.id,
      label: node.title,
      to: toFullPath(node),
      active: trail.length > 0 && trail[0]!.id === node.id,
    }))
})
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
      {{ item.label }}
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
.app-main-nav__item.is-active::after {
  content: '';
  position: absolute;
  left: calc(50% - 24px);
  bottom: 0;
  width: 48px;
  height: 3px;
  background: var(--sw-nav-topbar-active-indicator);
}
</style>

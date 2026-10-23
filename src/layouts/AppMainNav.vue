<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '@/locales'
import { useMenuStore } from '@/stores/menu'
import { Expand, Fold } from '@element-plus/icons-vue'
import { filterMenuByArea, resolveArea } from '@/foundation/area'
import { visibleMenuForArea, toFullPath, buildMenuTrail } from './menu-utils'
import { useLocalizedMenuTree } from './menu-title'
import { MenuType } from '@/contracts/menu'
import type { MenuNode } from '@/contracts/menu'
import { projectAdminSections } from './admin-sections'

/**
 * 顶部主导航（P53 设计节点 01/04）。
 *
 * 条目全部来自真实可达路由，不造空入口（方向 §4.3）：
 * - 菜单树节点带 topbar 投影序号时（服务端可下发），按序进入顶栏：叶子取自身
 *   路由，目录取首个可见叶子的路由——顶栏与侧栏是同一份菜单数据的两种投影；
 * - 无投影数据时走默认派生：
 *   - portal：工作台（常量路由）+ 菜单树中真实存在的流程中心 / 消息收件箱入口，
 *     以及常驻的用户端应用中心入口（见 APP_CENTER_PATH）；
 *   - admin：服务端下发菜单的顶层分组，点击进入该分组注册的首叶 redirect。
 * 数据只读 menu store（单一数据源），可达性以服务端过滤后的树为准。
 */

interface MainNavItem {
  key: string
  label: string
  to: string
  active: boolean
}

withDefaults(
  defineProps<{
    showSidebarToggle?: boolean
    sidebarCollapsed?: boolean
  }>(),
  {
    showSidebarToggle: false,
    sidebarCollapsed: false,
  },
)

const emit = defineEmits<{ 'toggle-sidebar': [] }>()

const route = useRoute()
const menuStore = useMenuStore()
const { t } = useI18n()

/**
 * 用户端「应用中心」入口（与工作台/我的门户/流程中心同级）。
 * 入口只依赖登录态与用户端区域：应用可见范围、表单与数据权限由服务端按当前用户过滤，
 * 无可见应用时应用中心页面自身给空态；不要求具备后台表单管理权限，也不绕过服务端守卫。
 */
const APP_CENTER_PATH = '/form/app-center'

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
  if (to === '/workflow/defs') {
    // 同一设计器路由在表单工作台内属于表单管理；直接流程设计仍属于流程管理。
    if (route.query.from === 'form-workbench' && route.path.endsWith('/design')) return false
    return route.path === to || route.path.startsWith(`${to}/`)
  }
  // 应用中心：应用内容（/form/app-center/:appId）与表单数据列表（/form/app-form/:formKey）
  // 都是该栏目的下钻页面，保持顶栏选中态。
  if (to === APP_CENTER_PATH) {
    return (
      route.path === to ||
      route.path.startsWith(`${to}/`) ||
      route.path.startsWith('/form/app-form/')
    )
  }
  // P53：表单设计器工作台（/form/designer/:id）属于「表单管理」子树深链
  if (to === '/form/form-def-list') {
    return (
      route.path === to ||
      (route.path.startsWith('/form/') &&
        !(route.path.startsWith('/form/designer/') && route.query.tab === 'processes')) ||
      // 表单工作台中的流程设计仍属于「表单管理」；直接进入流程管理设计器则保持流程管理选中。
      (route.query.from === 'form-workbench' && route.path.endsWith('/design'))
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
  const areaVisible = visibleMenuForArea(localizedMenu.value, area.value)
  const visible = area.value === 'admin' ? projectAdminSections(areaVisible, t) : areaVisible
  if (area.value === 'portal') {
    const result: MainNavItem[] = [
      {
        key: 'workspace',
        label: t('common.workspace'),
        to: '/workspace',
        active: route.path === '/workspace' || route.path.startsWith('/workspace/'),
      },
    ]
    const before = result.length
    collectTopbarItems(areaMenu.value, result)
    if (result.length === before) {
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
    }
    if (!result.some((item) => item.to === APP_CENTER_PATH)) {
      result.push({
        key: 'app-center',
        label: t('form.appCenter.centerTitle'),
        to: APP_CENTER_PATH,
        active: isActive(APP_CENTER_PATH),
      })
    }
    // 顶栏不放收件箱入口（V012-BUG-008）：铃铛面板「查看全部」是唯一列表入口，
    // 无论服务端是否下发收件箱 topbar 投影，统一收敛。
    return result.filter((item) => item.to !== '/notify/inbox')
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
  <div
    class="app-main-nav-shell"
    :class="[`app-main-nav-shell--${area}`, { 'has-sidebar-toggle': showSidebarToggle }]"
  >
    <button
      v-if="showSidebarToggle"
      type="button"
      class="app-main-nav__sidebar-toggle"
      data-test="sidebar-toggle"
      :aria-label="t('nav.toggleSidebar')"
      :aria-expanded="!sidebarCollapsed"
      aria-controls="app-sidebar"
      :title="t('nav.toggleSidebar')"
      @click="emit('toggle-sidebar')"
    >
      <el-icon :size="18" aria-hidden="true">
        <Expand v-if="sidebarCollapsed" />
        <Fold v-else />
      </el-icon>
    </button>
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
  </div>
</template>

<style scoped>
.app-main-nav-shell {
  display: flex;
  align-items: stretch;
  gap: var(--sw-space-8);
  height: 100%;
  min-width: 0;
}
.app-main-nav__sidebar-toggle {
  display: inline-flex;
  flex: 0 0 40px;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  align-self: center;
  padding: 0;
  border: 0;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-nav-topbar-text);
  cursor: pointer;
}
.app-main-nav__sidebar-toggle:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.app-main-nav {
  display: flex;
  flex: 1;
  align-items: stretch;
  /* V012-BUG-020：前台顶栏 tab 左对齐（紧跟 Logo 区域） */
  justify-content: flex-start;
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
  align-items: center;
  gap: var(--sw-space-8);
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
  flex: 0 0 112px;
  box-sizing: border-box;
  height: 40px;
  font-weight: var(--sw-font-weight-emphasis);
  border-radius: var(--sw-radius-base);
  /* RA03b 窄屏修复：显式 88px 会压过 flex 的 min-width:auto，nowrap 文字溢出与相邻项重叠；
     max-content 保底不压缩文字，宽屏仍均分、窄屏由容器横向滑动（方向 §4.5 不留不可操作元素） */
  min-width: max-content;
  padding: 0 12px;
}
.app-main-nav--admin .app-main-nav__item.is-active::after {
  display: none;
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

<style scoped>
.app-main-nav-shell--portal .app-main-nav__sidebar-toggle {
  flex-basis: 36px;
  width: 36px;
}
.app-main-nav-shell--portal:not(.has-sidebar-toggle) {
  box-sizing: border-box;
  padding-left: 44px;
}
.app-main-nav--portal {
  align-items: center;
  gap: var(--sw-space-8);
}
.app-main-nav--portal .app-main-nav__item {
  box-sizing: border-box;
  flex-basis: 124px;
  height: 40px;
  border-radius: var(--sw-radius-base);
  font-weight: var(--sw-font-weight-emphasis);
}
.app-main-nav--portal .app-main-nav__item.is-active::after {
  display: none;
}
</style>

<style scoped>
.app-main-nav--portal .app-main-nav__item.is-active {
  color: var(--sw-nav-topbar-text);
}
</style>

<script setup lang="ts">
/* global document, window, HTMLElement, MouseEvent, KeyboardEvent */
import { computed, ref, watch, onBeforeUnmount, reactive, type CSSProperties } from 'vue'
import sidebarGrid from '@/assets/navigation/sidebar-grid.svg'
import sidebarDocument from '@/assets/navigation/sidebar-document.svg'
import sidebarClock from '@/assets/navigation/sidebar-clock.svg'
import sidebarCheck from '@/assets/navigation/sidebar-check.svg'
import sidebarBell from '@/assets/navigation/sidebar-bell.svg'
import sidebarEdit from '@/assets/navigation/sidebar-edit.svg'
import { useRoute, useRouter } from 'vue-router'
import { useMenuStore } from '@/stores/menu'
import { resolveArea } from '@/foundation/area'
import { visibleMenuForArea, toFullPath } from '../menu-utils'
import { useLocalizedMenuTree, useNodeTitle } from '../menu-title'
import { MenuType, type MenuNode } from '@/contracts/menu'
import AppSidebarNode from './AppSidebarNode.vue'
import { projectAdminSections } from '../admin-sections'
import { useI18n } from '@/locales'

// 0.2.0 多级侧栏（direction-sidebar-navigation-020）：
// 展开态=左对齐菜单树（叶子/目录/弱分组标题）；收起态=最外层入口图标列＋目录右侧子树浮层。
// 只读 menu store（单一数据源）；导航、顺序、权限沿服务端过滤后的树，不摊平不臆造父级。
const props = defineProps<{ collapse: boolean; dark?: boolean }>()

const route = useRoute()
const router = useRouter()
const menuStore = useMenuStore()
const { t } = useI18n()
const nodeTitle = useNodeTitle()

const localizedMenu = useLocalizedMenuTree(computed(() => menuStore.menu))

const area = computed(() => resolveArea(route.path))
/** 视觉主题：部分管理节点（6:2）按深色导航呈现，内容/权限仍按真实 area。 */
const tone = computed(() => (props.dark ? 'portal' : area.value))

/** 工作台页轻量导航（V012-BUG-004）：/workspace 下五个直达项。 */
const workspaceSlim = computed(() => area.value === 'portal' && route.path.startsWith('/workspace'))
/** 流程中心上下文（V012-BUG-006）：/workflow/* 仅流程管理分组子项。 */
const catalogSlim = computed(() => area.value === 'portal' && route.path.startsWith('/workflow'))
/** 收件箱上下文（V012-BUG-008）：/notify/* 仅分类直达项。 */
const inboxSlim = computed(() => area.value === 'portal' && route.path.startsWith('/notify'))

/**
 * 后台侧栏按顶部导航分区收敛；前台按页面上下文收敛（V012-BUG-004/006/008）。
 */
const items = computed(() => {
  const current = resolveArea(route.path)
  const areaVisible = visibleMenuForArea(localizedMenu.value, current)
  const scoped = current === 'admin' ? projectAdminSections(areaVisible, t) : areaVisible
  if (current !== 'admin') {
    if (workspaceSlim.value) return []
    if (inboxSlim.value) return []
    if (catalogSlim.value) {
      const group = scoped.find((node) => toFullPath(node) === '/workflow')
      return group?.children?.length ? group.children : scoped
    }
    return scoped
  }
  const group = scoped.find((node) => subtreeContains(node, route.path))
  if (!group) return scoped
  return group.children?.length ? group.children : [group]
})

/** 纯展示分组标题（展开态弱化小标题；收起态隐去）：后台=当前分区名，工作台=协作分组。 */
const adminSectionTitle = computed(() => {
  if (area.value !== 'admin') return ''
  return (
    projectAdminSections(visibleMenuForArea(localizedMenu.value, 'admin'), t).find((node) =>
      subtreeContains(node, route.path),
    )?.title ?? ''
  )
})
const groupTitle = computed(() => {
  if (props.collapse) return ''
  if (adminSectionTitle.value) return adminSectionTitle.value
  if (workspaceSlim.value) return t('workflow.collaborationSection')
  return ''
})

function subtreeContains(node: MenuNode, path: string): boolean {
  const full = toFullPath(node)
  if (path === full || path.startsWith(`${full}/`)) return true
  return (node.children ?? []).some((child) => subtreeContains(child, path))
}

/** 深链激活映射（设计节点03/27）：表单渲染→流程中心；任务详情→我的待办。 */
const activePath = computed(() => {
  if (inboxSlim.value) return route.fullPath ?? route.path
  if (route.path.startsWith('/form/form-render/')) return '/workflow/catalog'
  if (route.path.startsWith('/workflow/task/')) return '/workflow/todo'
  return resolveAdminActive(route.path) || route.path
})

/** 详情页高亮到所属菜单项（如 /form/designer/:id → 表单设计）。 */
function resolveAdminActive(path: string): string {
  let matched = ''
  const walk = (nodes: MenuNode[]): void => {
    for (const node of nodes) {
      const full = toFullPath(node)
      if (node.menuType === MenuType.MENU && (path === full || path.startsWith(`${full}/`))) {
        if (full.length > matched.length) matched = full
      }
      if (node.children?.length) walk(node.children as MenuNode[])
    }
  }
  walk(items.value)
  return matched
}

// ── 目录展开状态：按区域分别保留（direction：不同模块状态不串用）。
// 组件实例作用域：侧栏在 SPA 存活期内不重挂，区域键隔离已满足；测试间天然隔离。 ──
const expandedByArea = reactive<Record<string, Set<string>>>({})
/** 按区域取目录展开集（懒建；写入经 reactive 记录保持响应）。 */
function expandedSetFor(key: string): Set<string> {
  if (!expandedByArea[key]) expandedByArea[key] = new Set<string>()
  return expandedByArea[key]
}
function isExpanded(node: MenuNode): boolean {
  return expandedSetFor(area.value).has(toFullPath(node))
}
function toggleDir(node: MenuNode): void {
  const key = toFullPath(node)
  const set = expandedSetFor(area.value)
  if (set.has(key)) set.delete(key)
  else set.add(key)
}

/** 深链/刷新：展开当前路径的全部祖先目录，使当前项可见。 */
function expandAncestorsOfActive(): void {
  const walk = (nodes: MenuNode[], ancestors: string[]): boolean => {
    for (const node of nodes) {
      const full = toFullPath(node)
      if (full === activePath.value) {
        ancestors.forEach((a) => expandedSetFor(area.value).add(a))
        return true
      }
      if (node.children?.length) {
        if (walk(node.children as MenuNode[], [...ancestors, full])) return true
      }
    }
    return false
  }
  walk(items.value, [])
}

// ── 收起态目录子树浮层（单实例；点击目录打开，不更换正文） ──
const flyout = ref<{ node: MenuNode; top: number } | null>(null)
const flyoutExpanded = ref<Set<string>>(new Set())
const flyoutAnchorEl = ref<HTMLElement | null>(null)
const flyoutStyle = computed((): CSSProperties => {
  if (!flyout.value) return {}
  const top = Math.max(8, Math.min(flyout.value.top, window.innerHeight - 24 - 320))
  return { position: 'fixed', left: '72px', top: `${top}px` }
})
function openFlyout(node: MenuNode, anchor: HTMLElement): void {
  if (flyout.value && toFullPath(flyout.value.node) === toFullPath(node)) {
    closeFlyout()
    return
  }
  const rect = anchor.getBoundingClientRect()
  flyout.value = { node, top: rect.top }
  flyoutAnchorEl.value = anchor
  const seed = new Set<string>()
  const seedActive = (nodes: MenuNode[]): boolean => {
    for (const n of nodes) {
      const full = toFullPath(n)
      if (full === activePath.value) return true
      if (n.children?.length && seedActive(n.children as MenuNode[])) {
        seed.add(full)
        return true
      }
    }
    return false
  }
  seedActive((node.children ?? []) as MenuNode[])
  flyoutExpanded.value = seed
}
function closeFlyout(): void {
  flyout.value = null
}
function flyoutIsExpanded(node: MenuNode): boolean {
  return flyoutExpanded.value.has(toFullPath(node))
}
function flyoutToggle(node: MenuNode): void {
  const key = toFullPath(node)
  if (flyoutExpanded.value.has(key)) flyoutExpanded.value.delete(key)
  else flyoutExpanded.value.add(key)
}
function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (flyoutAnchorEl.value?.contains(target)) return
  if (target.closest('.app-sidebar-flyout')) return
  closeFlyout()
}
function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && flyout.value) {
    closeFlyout()
    flyoutAnchorEl.value?.focus()
  }
}
watch(
  activePath,
  () => {
    expandAncestorsOfActive()
    closeFlyout()
  },
  { immediate: true },
)
watch(
  () => props.collapse,
  () => closeFlyout(),
)
if (typeof document !== 'undefined') {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
  onBeforeUnmount(() => {
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onDocumentKeydown)
  })
}

// ── 工作台固定直达项（V012-BUG-004） ──
const workspaceFixedItems = computed(() => [
  { path: '/workspace/todo', label: t('workflow.myTodoTitle'), icon: sidebarDocument },
  { path: '/workspace/my-instances', label: t('common.startedByMe'), icon: sidebarClock },
  { path: '/workspace/processed', label: t('workflow.processedNav'), icon: sidebarCheck },
  { path: '/workspace/my-cc', label: t('router.myCc'), icon: sidebarBell },
  { path: '/workspace/my-drafts', label: t('common.statusDraft'), icon: sidebarEdit },
])
function navigate(path: string): void {
  void router.push(path)
}
function labelOf(node: MenuNode): string {
  return String(nodeTitle(node) ?? '').trim()
}
const inboxTabs = computed(() => [
  { path: '/notify/inbox', label: t('common.all') },
  { path: '/notify/inbox?read=true', label: t('notify.read') },
  { path: '/notify/inbox?read=false', label: t('notify.unread') },
])
</script>

<template>
  <nav
    class="app-sidebar-tree"
    :class="[`app-sidebar-tree--${tone}`, `app-sidebar--${tone}`, { 'is-collapsed': collapse }]"
    :aria-label="t('nav.mainNav')"
  >
    <!-- 纯展示分组标题：展开态弱化小标题；收起态隐去（细分隔保留分组） -->
    <div v-if="groupTitle" class="app-sidebar-tree__group-title">{{ groupTitle }}</div>
    <div
      v-else-if="collapse && items.length"
      class="app-sidebar-tree__divider"
      aria-hidden="true"
    />

    <!-- 工作台固定项（workspaceSlim）：工作台 + 五直达 -->
    <template v-if="workspaceSlim">
      <button
        type="button"
        class="sb-row sb-row--leaf"
        :class="{ 'is-active': activePath === '/workspace' }"
        :aria-current="activePath === '/workspace' ? 'page' : undefined"
        @click="navigate('/workspace')"
      >
        <span class="sb-row__slot"><img :src="sidebarGrid" alt="" class="sb-row__img" /></span>
        <span v-if="!collapse" class="sb-row__name">{{ $t('common.workspace') }}</span>
      </button>
      <button
        v-for="item in workspaceFixedItems"
        :key="item.path"
        type="button"
        class="sb-row sb-row--leaf"
        :class="{ 'is-active': activePath === item.path }"
        :aria-current="activePath === item.path ? 'page' : undefined"
        @click="navigate(item.path)"
      >
        <span class="sb-row__slot"><img :src="item.icon" alt="" class="sb-row__img" /></span>
        <span v-if="!collapse" class="sb-row__name">{{ item.label }}</span>
      </button>
    </template>

    <!-- 收件箱分类直达（V012-BUG-008） -->
    <template v-if="inboxSlim">
      <button
        v-for="tabItem in inboxTabs"
        :key="tabItem.path"
        type="button"
        class="sb-row sb-row--leaf"
        :class="{ 'is-active': activePath === tabItem.path }"
        :aria-current="activePath === tabItem.path ? 'page' : undefined"
        @click="navigate(tabItem.path)"
      >
        <span v-if="!collapse" class="sb-row__name">{{ tabItem.label }}</span>
        <span v-else class="sb-row__char">{{ Array.from(tabItem.label)[0] }}</span>
      </button>
    </template>

    <!-- 菜单树（目录/叶子递归；收起态为图标列＋目录浮层） -->
    <AppSidebarNode
      v-for="node in items"
      :key="node.id"
      :node="node"
      :depth="0"
      :collapse="collapse"
      :active-path="activePath"
      :is-expanded="isExpanded"
      :toggle-dir="toggleDir"
      :open-flyout="openFlyout"
      :flyout-dir-path="flyout ? toFullPath(flyout.node) : undefined"
    />

    <!-- 收起态目录子树浮层（单实例；256px；距侧栏 8px；子树内滚动） -->
    <teleport to="body">
      <div
        v-if="flyout"
        class="app-sidebar-flyout"
        :class="[`app-sidebar-flyout--${tone}`, { 'app-sidebar--admin': tone === 'admin' }]"
        :style="flyoutStyle"
        role="menu"
        :aria-label="labelOf(flyout.node)"
      >
        <div class="app-sidebar-flyout__header">{{ labelOf(flyout.node) }}</div>
        <div class="app-sidebar-flyout__body">
          <AppSidebarNode
            v-for="child in (flyout.node.children ?? []) as MenuNode[]"
            :key="child.id"
            :node="child"
            :depth="0"
            :collapse="false"
            :active-path="activePath"
            :is-expanded="flyoutIsExpanded"
            :toggle-dir="flyoutToggle"
            :open-flyout="() => undefined"
          />
        </div>
      </div>
    </teleport>
  </nav>
</template>

<style scoped>
.app-sidebar-tree {
  display: block;
  width: 100%;
  color: var(--sw-nav-text-secondary, #c9d1e8);
}
.app-sidebar-tree__group-title {
  box-sizing: border-box;
  padding: 17px 13px 10px;
  font-size: 12px;
  color: var(--sw-nav-text-secondary, #c9d1e8);
  opacity: 0.72;
  user-select: none;
}
.app-sidebar--admin .app-sidebar-tree__group-title,
.app-sidebar-tree--admin .app-sidebar-tree__group-title {
  color: var(--sw-text-secondary, #909399);
}
.app-sidebar-tree__divider {
  height: 1px;
  margin: 8px 10px;
  background: currentColor;
  opacity: 0.12;
}
/* 工作台/收件箱固定行（与树行同几何） */
.sb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  margin-bottom: 4px;
  padding: 0 13px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.sb-row:hover {
  background: var(--sw-nav-hover-bg, rgba(255, 255, 255, 0.08));
  color: var(--sw-nav-text, #e8ecf6);
}
.app-sidebar-tree--admin .sb-row:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--sw-text-primary, #303133);
}
.sb-row--leaf.is-active {
  box-sizing: border-box;
  width: calc(100% - 24px);
  margin: 0 12px 4px;
  border-radius: 8px;
  background: var(--sw-color-primary);
  color: #ffffff;
  box-shadow: none;
}
.app-sidebar-tree--admin .sb-row--leaf.is-active {
  color: var(--sw-text-primary, #303133);
}
.sb-row__slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
}
.sb-row__img {
  width: 18px;
  height: 18px;
}
.sb-row__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-row__char {
  font-size: 14px;
  font-weight: 600;
}
/* 收起态目录子树浮层 */
.app-sidebar-flyout {
  z-index: 2000;
  box-sizing: border-box;
  width: 256px;
  max-height: calc(100vh - 24px);
  padding: 8px 0;
  overflow-y: auto;
  background: var(--sw-bg-color, #fff);
  border: 1px solid var(--sw-border-color, #dcdfe6);
  border-radius: var(--sw-radius-base, 6px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.app-sidebar-flyout__header {
  padding: 6px 14px 8px;
  color: var(--sw-text-secondary, #909399);
  font-size: 12px;
}
.app-sidebar-flyout__body {
  padding-bottom: 4px;
}
</style>

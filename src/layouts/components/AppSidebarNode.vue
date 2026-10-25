<script setup lang="ts">
/* global HTMLElement, MouseEvent, KeyboardEvent */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { toFullPath } from '../menu-utils'
import { menuIcon } from '../menu-icons'
import { useNodeTitle } from '../menu-title'

// 0.2.0 多级侧栏节点（direction-sidebar-navigation-020）：
// 叶子=页面入口；目录=可展开子树（展开态切换子树、收起态交给浮层）。
// 图标 18px 固定 24px 槽、与名称间距 10px、每层缩进 20px、行高 40px。
const props = defineProps<{
  node: MenuNode
  depth: number
  collapse: boolean
  activePath: string
  isExpanded: (node: MenuNode) => boolean
  toggleDir: (node: MenuNode) => void
  openFlyout: (node: MenuNode, anchor: HTMLElement) => void
  flyoutDirPath?: string
}>()

const router = useRouter()
const nodeTitle = useNodeTitle()

const full = computed(() => toFullPath(props.node))
const isDir = computed(
  () => props.node.menuType === MenuType.DIRECTORY && !!props.node.children?.length,
)
const isActive = computed(() => props.activePath === full.value)
const containsActive = computed(() => subtreeContains(props.node, props.activePath))
const expanded = computed(() => props.isExpanded(props.node))
const iconEl = computed(() => menuIcon(props.node.icon))
const firstChar = computed(() => {
  const text = String(nodeTitle(props.node) ?? '').trim()
  return text ? Array.from(text)[0] : '·'
})

function subtreeContains(node: MenuNode, path: string): boolean {
  const f = toFullPath(node)
  if (path === f || path.startsWith(`${f}/`)) return true
  return (node.children ?? []).some((child) => subtreeContains(child, path))
}

function onRowClick(event: MouseEvent): void {
  if (props.collapse && isDir.value) {
    props.openFlyout(props.node, event.currentTarget as HTMLElement)
    return
  }
  if (isDir.value) {
    props.toggleDir(props.node)
    return
  }
  void router.push(full.value)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onRowClick(event as unknown as MouseEvent)
  }
}

const childNodes = computed(() => (props.node.children ?? []) as MenuNode[])
const flyoutOpen = computed(() => !!props.flyoutDirPath && props.flyoutDirPath === full.value)
</script>

<template>
  <!-- 收起态：仅最外层可操作入口（叶子/目录），居中图标/首字 + 完整名提示 -->
  <button
    v-if="collapse"
    type="button"
    class="sb-node__icon-btn"
    :class="{
      'is-active': isActive,
      'is-ancestor': isDir && containsActive && !isActive,
      'is-open': flyoutOpen,
    }"
    :aria-label="nodeTitle(node)"
    :aria-expanded="isDir ? flyoutOpen : undefined"
    :aria-current="isActive ? 'page' : undefined"
    :title="nodeTitle(node)"
    @click="onRowClick"
    @keydown="onKeydown"
  >
    <span class="sb-node__slot">
      <el-icon v-if="iconEl" :size="18"><component :is="iconEl" /></el-icon>
      <span v-else class="sb-node__char">{{ firstChar }}</span>
      <span v-if="isDir" class="sb-node__dir-indicator" aria-hidden="true" />
    </span>
  </button>
  <template v-else>
    <!-- 展开态目录行：图标/首字 + 名称（中字重）+ 尾部箭头；点击切换子树 -->
    <button
      v-if="isDir"
      type="button"
      class="sb-node__row sb-node__row--dir"
      :class="{
        'is-open': expanded,
        'is-ancestor': containsActive && !isActive,
      }"
      :style="{ paddingLeft: 13 + depth * 20 + 'px' }"
      :aria-expanded="expanded"
      @click="onRowClick"
      @keydown="onKeydown"
    >
      <span class="sb-node__slot">
        <el-icon v-if="iconEl" :size="18"><component :is="iconEl" /></el-icon>
        <span v-else class="sb-node__char">{{ firstChar }}</span>
      </span>
      <span class="sb-node__name sb-node__name--dir">{{ nodeTitle(node) }}</span>
      <el-icon class="sb-node__arrow" :size="14" aria-hidden="true">
        <ArrowDown v-if="expanded" />
        <ArrowRight v-else />
      </el-icon>
    </button>
    <!-- 展开态页面行：图标/首字 + 完整名称；点击导航 -->
    <button
      v-else
      type="button"
      class="sb-node__row sb-node__row--leaf"
      :class="{ 'is-active': isActive }"
      :style="{ paddingLeft: 13 + depth * 20 + 'px' }"
      :aria-current="isActive ? 'page' : undefined"
      @click="onRowClick"
      @keydown="onKeydown"
    >
      <span class="sb-node__slot">
        <el-icon v-if="iconEl" :size="18"><component :is="iconEl" /></el-icon>
        <span v-else class="sb-node__char">{{ firstChar }}</span>
      </span>
      <span class="sb-node__name">{{ nodeTitle(node) }}</span>
    </button>
    <!-- 子树：目录展开后按层级缩进渲染 -->
    <template v-if="isDir && expanded">
      <AppSidebarNode
        v-for="child in childNodes"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :collapse="false"
        :active-path="activePath"
        :is-expanded="isExpanded"
        :toggle-dir="toggleDir"
        :open-flyout="openFlyout"
        :flyout-dir-path="flyoutDirPath"
      />
    </template>
  </template>
</template>

<style scoped>
.sb-node__row {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding-right: 12px;
  border: 0;
  background: transparent;
  color: var(--sw-nav-text-secondary, #c9d1e8);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.sb-node__row:hover {
  color: var(--sw-nav-text, #e8ecf6);
}
.sb-node__row--leaf.is-active {
  background: var(--sw-nav-sidebar-active-bg);
  color: var(--sw-nav-text, #e8ecf6);
  box-shadow: inset 3px 0 0 var(--sw-brand-color, #2563eb);
}
.sb-node__row--dir {
  font-weight: 500;
  color: var(--sw-nav-text, #e8ecf6);
}
.sb-node__row--dir.is-ancestor:not(.is-open) {
  color: var(--sw-brand-color, #2563eb);
}
.sb-node__row--dir.is-open {
  color: var(--sw-nav-text, #e8ecf6);
}
.sb-node__slot {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
}
.sb-node__char {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}
.sb-node__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-node__arrow {
  flex: 0 0 auto;
}
/* 收起态图标按钮：64px 栏内 40px 行、24px 槽居中；目录带细小完整指示 */
.sb-node__icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sw-nav-text-secondary, #c9d1e8);
  cursor: pointer;
}
.sb-node__icon-btn:hover {
  color: var(--sw-nav-text, #e8ecf6);
}
.sb-node__icon-btn.is-active {
  background: var(--sw-nav-sidebar-active-bg);
  color: var(--sw-nav-text, #e8ecf6);
}
.sb-node__icon-btn.is-ancestor {
  color: var(--sw-brand-color, #2563eb);
}
.sb-node__icon-btn.is-open {
  color: var(--sw-nav-text, #e8ecf6);
}
.sb-node__dir-indicator {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.85;
}
/* 浅色主题（管理端）前景适配 */
:global(.app-sidebar--admin) .sb-node__row {
  color: var(--sw-text-secondary, #606266);
}
:global(.app-sidebar--admin) .sb-node__row:hover,
:global(.app-sidebar--admin) .sb-node__row--dir,
:global(.app-sidebar--admin) .sb-node__row--leaf.is-active {
  color: var(--sw-text-primary, #303133);
}
:global(.app-sidebar--admin) .sb-node__row--dir.is-ancestor:not(.is-open) {
  color: var(--sw-brand-color, #2563eb);
}
:global(.app-sidebar--admin) .sb-node__icon-btn {
  color: var(--sw-text-secondary, #606266);
}
:global(.app-sidebar--admin) .sb-node__icon-btn:hover,
:global(.app-sidebar--admin) .sb-node__icon-btn.is-active {
  color: var(--sw-text-primary, #303133);
}
:global(.app-sidebar--admin) .sb-node__icon-btn.is-ancestor {
  color: var(--sw-brand-color, #2563eb);
}
</style>

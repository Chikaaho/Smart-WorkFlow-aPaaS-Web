<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { resolveArea } from '@/foundation/area'
import AppLogo from './components/AppLogo.vue'
import AppMainNav from './AppMainNav.vue'
import AppTopbar from './components/AppTopbar.vue'
import AppSidebar from './components/AppSidebar.vue'

/**
 * 根布局（常量路由 app-root）：顶部主导航条 + 深色侧栏 + 内容区（P53 设计节点 01/04）。
 * 用户端与管理端顶栏使用 Figma 页面级表面色，主操作继续使用品牌主色；侧栏恒为深色导航阶。
 * 动态业务路由由 router/guard 挂为本布局子路由；菜单数据保持单一数据源。
 */
const { t } = useI18n()
const appStore = useAppStore()
const route = useRoute()
const collapsed = computed(() => appStore.sidebarCollapsed)
const area = computed(() => resolveArea(route.path))
/** 企业门户（P53 节点05）设计为顶栏全宽形态，不渲染侧栏 */
const showAside = computed(() => route.path !== '/portal')
</script>

<template>
  <div class="basic-layout">
    <header class="basic-layout__topbar" :class="`basic-layout__topbar--${area}`">
      <AppLogo :collapse="false" :area="area" />
      <AppMainNav class="basic-layout__nav" />
      <AppTopbar class="basic-layout__actions" />
    </header>
    <div class="basic-layout__body">
      <aside
        v-if="showAside"
        class="basic-layout__aside"
        :class="{ 'basic-layout__aside--collapsed': collapsed }"
      >
        <AppSidebar :collapse="collapsed" class="basic-layout__menu" />
        <div class="basic-layout__aside-foot">
          <div v-show="!collapsed" class="basic-layout__area-card">
            <svg
              class="basic-layout__area-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="M4 21V9l8-6 8 6v12h-6v-6h-4v6H4z" stroke-linejoin="round" />
            </svg>
            <div class="basic-layout__area-text">
              <span class="basic-layout__area-label">{{
                area === 'admin' ? t('nav.currentView') : t('nav.currentSpace')
              }}</span>
              <span class="basic-layout__area-value">{{
                area === 'admin' ? t('nav.adminConsole') : t('nav.defaultWorkspace')
              }}</span>
            </div>
          </div>
          <div class="basic-layout__aside-controls">
            <router-link to="/workspace" class="basic-layout__home-link" aria-label="home">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                aria-hidden="true"
              >
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V21h14V9.5" />
              </svg>
            </router-link>
            <button
              type="button"
              class="basic-layout__collapse-btn"
              :aria-label="t('nav.toggleSidebar')"
              @click="appStore.toggleSidebar()"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                :style="collapsed ? 'transform: scaleX(-1)' : ''"
                aria-hidden="true"
              >
                <path
                  d="M11 7l-5 5 5 5M18 7l-5 5 5 5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </aside>
      <main class="basic-layout__content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.basic-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.basic-layout__topbar {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 0 0 var(--sw-layout-header-height);
  padding: 0 0 0 16px;
  background: var(--sw-nav-topbar-portal-bg);
}
.basic-layout__topbar--admin {
  background: var(--sw-nav-topbar-admin-bg);
}
.basic-layout__nav {
  flex: 1 1 0;
  min-width: 0;
}
.basic-layout__actions {
  box-sizing: border-box;
  flex: 0 0 336px;
  width: 336px;
  padding-right: 24px;
  justify-content: flex-end;
}
.basic-layout__body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.basic-layout__aside {
  display: flex;
  flex-direction: column;
  flex: 0 0 var(--sw-layout-aside-width);
  width: var(--sw-layout-aside-width);
  min-height: 0;
  background: var(--sw-nav-sidebar-bg);
  transition:
    width 0.2s ease,
    flex-basis 0.2s ease;
  overflow: hidden;
}
.basic-layout__aside--collapsed {
  flex-basis: var(--sw-layout-aside-width-collapsed);
  width: var(--sw-layout-aside-width-collapsed);
}
.basic-layout__menu {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.basic-layout__aside-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--sw-nav-border);
}
/* 设计（节点01）：空间卡与底部控制行分两行，控制行贴底 */
.basic-layout__aside-foot {
  flex-direction: column;
  align-items: stretch;
  padding-bottom: 20px;
}
.basic-layout__aside-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding: 0 4px;
}
.basic-layout__home-link {
  display: inline-flex;
  color: var(--sw-nav-text-secondary);
}
.basic-layout__home-link:hover {
  color: var(--sw-nav-text);
}
.basic-layout__area-card {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--sw-radius-base);
  background: var(--sw-nav-bg-raised);
}
.basic-layout__area-icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  color: var(--sw-nav-text-secondary);
}
.basic-layout__area-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.basic-layout__area-label {
  font-size: 12px;
  color: var(--sw-nav-text-secondary);
}
.basic-layout__area-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--sw-nav-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.basic-layout__collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-nav-text-secondary);
  cursor: pointer;
}
.basic-layout__collapse-btn:hover {
  color: var(--sw-nav-text);
  background: var(--sw-nav-hover-bg);
}
.basic-layout__collapse-btn svg {
  width: 16px;
  height: 16px;
}
.basic-layout__content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--sw-surface-page);
}
/* R5 延续：移动视口隐藏侧栏，页面主体无横向溢出（业务表格保留容器内局部横滚） */
@media (max-width: 767px) {
  .basic-layout__aside {
    display: none;
  }
  .basic-layout__topbar {
    padding-left: 12px;
  }
  .basic-layout__topbar :deep(.app-logo__text) {
    display: none;
  }
  .basic-layout__topbar :deep(.app-logo) {
    box-sizing: border-box;
    flex: 0 0 48px;
    width: 48px;
    padding: 0;
  }
  .basic-layout__nav {
    display: none;
  }
  .basic-layout__actions {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    padding-right: 12px;
  }
}
</style>

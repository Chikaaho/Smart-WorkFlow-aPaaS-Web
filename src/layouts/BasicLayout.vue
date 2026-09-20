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
import badgeSpaceUrl from '@/assets/brand/badge-space.png'

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
const areaValue = computed(() =>
  area.value === 'admin' ? t('nav.adminConsole') : t('nav.defaultWorkspace'),
)
/** 企业门户（节点05）为顶栏全宽；表单/流程设计器（节点07-14）为全宽三栏画布——均不渲染深色侧栏 */
const showAside = computed(
  () =>
    route.path !== '/portal' &&
    !route.path.startsWith('/form/designer') &&
    !route.path.endsWith('/design'),
)
</script>

<template>
  <div class="basic-layout" :class="`basic-layout--${area}`">
    <header class="basic-layout__topbar" :class="`basic-layout__topbar--${area}`">
      <AppLogo :collapse="false" :area="area" />
      <AppMainNav class="basic-layout__nav" />
      <AppTopbar class="basic-layout__actions" />
    </header>
    <div class="basic-layout__body">
      <aside
        v-if="showAside"
        class="basic-layout__aside"
        :class="[
          { 'basic-layout__aside--collapsed': collapsed },
          `basic-layout__aside--${area}`,
        ]"
      >
        <AppSidebar :collapse="collapsed" class="basic-layout__menu" />
        <div class="basic-layout__aside-foot">
          <div class="basic-layout__area-card">
            <img class="basic-layout__area-icon" :src="badgeSpaceUrl" alt="" aria-hidden="true" />
            <div class="basic-layout__area-text">
              <span class="basic-layout__area-label">{{
                area === 'admin' ? t('nav.currentView') : t('nav.currentSpace')
              }}</span>
              <span class="basic-layout__area-value">{{ areaValue }}</span>
            </div>
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
  border-radius: 18px;
}
.basic-layout__topbar {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0;
  /* Keep the locked frame height explicit; Chromium's flex-basis sizing adds
     borders to the flex item even when box-sizing is border-box. */
  flex: 0 0 auto;
  height: var(--sw-layout-header-height);
  /* 设计（节点02）：品牌区自带 24px 左内距，顶栏不再叠加 */
  padding: 0 0 0 0;
  background: var(--sw-nav-topbar-portal-bg);
  border: 1px solid #352c88;
}
.basic-layout__topbar--admin {
  box-sizing: border-box;
  background: var(--sw-nav-topbar-admin-bg);
  border: 1px solid #27345c;
  flex: 0 0 auto;
  height: 64px;
}
.basic-layout__nav {
  flex: 1 1 0;
  min-width: 0;
}
.basic-layout__actions {
  box-sizing: border-box;
  flex: 0 0 336px;
  width: 336px;
  /* 设计（节点02）：个人区 1105 起，搜索锚点 1225 */
  justify-content: flex-start;
  padding-left: 122px;
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
.basic-layout__menu {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
/* 设计（节点04）：管理端侧栏加宽至 236px（组盒 212 + 右缘 24 对齐设计帧）；折叠态除外 */
.basic-layout__aside--admin:not(.basic-layout__aside--collapsed) {
  flex-basis: 236px;
  width: 236px;
}
.basic-layout__aside-foot {
  /* 设计（节点01/02）：底部仅空间切换卡（200×66），卡底距参考视口（1024）下缘 98px。
     高于参考视口的屏幕/采集视口只延伸内容区，壳层卡片仍锚在 1024 参考帧内（节点19 长页基线同规）。 */
  display: flex;
  flex-direction: column;
  margin-top: auto;
  padding: 0 12px 0;
  margin-bottom: max(98px, calc(100vh - 926px));
}
.basic-layout__area-card {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  height: 66px;
  padding: 0 12px 0 11px;
  border: 1px solid #344164;
  border-radius: 8px;
  background: var(--sw-nav-area-card-bg);
}
.basic-layout__area-icon {
  display: inline-flex;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #29235c;
}
.basic-layout__area-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-top: -3px;
}
.basic-layout__area-label {
  font-size: 12px;
  line-height: 18px;
  color: var(--sw-nav-text-secondary);
}
.basic-layout__area-value {
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: var(--sw-nav-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.basic-layout__content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--sw-surface-page);
  /* P53 设计（全 32 页）：内容区不显示滚动条，内容宽按设计 1152 全量呈现 */
  scrollbar-width: none;
}
.basic-layout__content::-webkit-scrollbar {
  width: 0;
  height: 0;
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

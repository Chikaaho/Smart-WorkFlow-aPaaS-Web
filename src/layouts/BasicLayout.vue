<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { useI18n } from '@/locales'
import { resolveArea } from '@/foundation/area'
import AppLogo from './components/AppLogo.vue'
import AppMainNav from './AppMainNav.vue'
import AppTopbar from './components/AppTopbar.vue'
import AppSidebar from './components/AppSidebar.vue'

/**
 * 根布局（常量路由 app-root）：顶部主导航条 + 侧栏 + 内容区（P53 设计节点 01/04）。
 * 用户端与管理端顶栏使用 Figma 页面级表面色，主操作继续使用品牌主色；
 * 用户端侧栏为深色导航阶，管理端侧栏使用新稿浅色表面。
 * 动态业务路由由 router/guard 挂为本布局子路由；菜单数据保持单一数据源。
 * V011-BUG-003：移除侧栏底部空间提醒卡（Owner 裁决，用户端/管理端一致）。
 * 0.2.0（Owner 反馈 + 401:8637 SidebarToggle 规范）：侧栏收起/展开入口从顶栏主导航
 * 移至侧栏与正文交界处，顶栏主导航起点不因该入口改变。
 */
const appStore = useAppStore()
const route = useRoute()
const { t } = useI18n()
const collapsed = computed(() => appStore.sidebarCollapsed)
const area = computed(() => resolveArea(route.path))
/** 企业门户（节点05）为顶栏全宽；表单/流程设计器（节点07-14）为全宽三栏画布；
 *  应用中心（列表/应用内页/表单数据列表，Owner 2026-10-16 裁决）同样顶栏全宽——
 *  这三类页面均不渲染深色侧栏。0.1.7 #4：应用详情（管理工作台/表单上下文）改用
 *  应用专属侧边栏，同样不渲染通用深色侧栏。
 *  0.1.7 #33（Owner 裁决）：应用管理列表页 /form/app-manage 也不渲染通用深色侧栏——
 *  该分区菜单只有「应用管理」自身一个条目，侧栏是自指的无效导航。 */
const showAside = computed(
  () =>
    route.path !== '/portal' &&
    route.path !== '/form/app-manage' &&
    !route.path.startsWith('/form/designer') &&
    !route.path.endsWith('/design') &&
    !route.path.startsWith('/form/app-center') &&
    !route.path.startsWith('/form/app-form/') &&
    !route.path.startsWith('/workflow/catalog') &&
    !route.path.startsWith('/workspace/config') &&
    !/^\/workflow\/defs\/[^/]+\/settings$/.test(route.path) &&
    !/^\/form\/app-manage\/[^/]+/.test(route.path),
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
        id="app-sidebar"
        class="basic-layout__aside"
        :class="[{ 'basic-layout__aside--collapsed': collapsed }, `basic-layout__aside--${area}`]"
        :style="
          collapsed
            ? {
                flexBasis: 'var(--sw-layout-aside-width-collapsed)',
                width: 'var(--sw-layout-aside-width-collapsed)',
              }
            : undefined
        "
      >
        <AppSidebar :collapse="collapsed" class="basic-layout__menu" />
        <!-- 0.2.0（Owner 口径，替代 401:8637 边缘手柄）：折叠入口固定侧栏底部，
             展开态「← 收起」、收起态「→」，菜单区独立滚动、底部条不随滚。 -->
        <div class="basic-layout__sidebar-bottom" :class="{ 'is-collapsed': collapsed }">
          <button
            type="button"
            class="basic-layout__sidebar-collapse"
            data-test="sidebar-collapse"
            :aria-label="collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')"
            :aria-expanded="!collapsed"
            aria-controls="app-sidebar"
            :title="collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')"
            @click="appStore.toggleSidebar()"
          >
            <el-icon v-if="area === 'admin'" :size="18" aria-hidden="true">
              <!-- 批次21（规划审查）：Expand/Fold 小尺寸下呈横线状无法辨向，改为明确单箭头 -->
              <ArrowRight v-if="collapsed" />
              <ArrowLeft v-else />
            </el-icon>
            <template v-else>
              <!-- 0.2.0 参考 3:2/4:2：用户端底部为「|← 收起」 -->
              <svg
                v-if="!collapsed"
                class="basic-layout__collapse-icon"
                viewBox="0 0 18 18"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  d="M2.5 4.5v9"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
                <path
                  d="M15 9H6.5M9.8 5.7 6.5 9l3.3 3.3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span v-else aria-hidden="true">→</span>
            </template>
            <span v-if="!collapsed" class="basic-layout__sidebar-collapse-label">
              {{ t('nav.collapseSidebar') }}
            </span>
          </button>
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
  /* V011-BUG-022：整页应用外壳不放圆角（Owner 2026-09-22 裁决） */
  border-radius: 0;
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
  border: none;
}
.basic-layout__topbar--admin {
  box-sizing: border-box;
  background: var(--sw-nav-topbar-admin-bg);
  border: none;
  gap: var(--sw-space-8);
  padding: 0 var(--sw-space-24);
  flex: 0 0 auto;
  height: 64px;
}
.basic-layout__nav {
  flex: 1 1 0;
  min-width: 0;
}
.basic-layout__actions {
  box-sizing: border-box;
  flex: 0 0 auto;
  width: auto;
  max-width: min(400px, 50vw);
  min-width: 0;
  justify-content: flex-end;
  padding: 0 var(--sw-space-24) 0 var(--sw-space-8);
}
.basic-layout--admin .basic-layout__actions {
  flex: 0 0 auto;
  width: auto;
  padding: 0;
  max-width: none;
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
/* 0.2.0（Owner 口径）：折叠入口固定侧栏底部，不随菜单滚动；
 * 展开态「← 收起」、收起态仅「→」图标居中；菜单区独立滚动。 */
.basic-layout__sidebar-bottom {
  flex: 0 0 auto;
  height: 48px;
  padding: 0 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
/* 0.2.0 参考 3:2/4:2：用户端底部收起条贴左，上边框取参考浅色 #E9EDF5 */
.basic-layout--portal .basic-layout__sidebar-bottom {
  padding: 0;
  border-top-color: #e9edf5;
}
.basic-layout--portal .basic-layout__sidebar-collapse {
  height: 48px;
  gap: 10px;
  padding: 0 16px;
}
.basic-layout--portal .basic-layout__sidebar-collapse-label {
  font-size: 14px;
}
.basic-layout__collapse-icon {
  flex: none;
}
.basic-layout--admin .basic-layout__sidebar-bottom {
  border-top-color: var(--sw-border-color, #dcdfe6);
}
.basic-layout__sidebar-collapse {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  height: 46px;
  padding: 0 13px;
  border: 0;
  border-radius: var(--sw-radius-base);
  background: transparent;
  /* 批次19（Owner）：深浅主题各自的对比色——深色侧栏用浅字、管理端浅色侧栏用深字 */
  color: var(--sw-nav-text-secondary, #c9d1e8);
  cursor: pointer;
}
.basic-layout__sidebar-collapse:hover {
  background: var(--sw-nav-hover-bg, rgba(255, 255, 255, 0.08));
  color: #fff;
}
.basic-layout--admin .basic-layout__sidebar-collapse {
  color: var(--sw-text-secondary, #606266);
}
.basic-layout--admin .basic-layout__sidebar-collapse:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--sw-text-primary, #303133);
}
.basic-layout__sidebar-collapse-label {
  font-size: 14px;
  white-space: nowrap;
}
/* 批次16：收起态底部箭头清晰居中（右向展开箭头独立成列） */
.basic-layout__sidebar-bottom.is-collapsed {
  padding: 0;
}
.basic-layout__sidebar-bottom.is-collapsed .basic-layout__sidebar-collapse {
  justify-content: center;
  padding: 0;
}
.basic-layout__sidebar-bottom.is-collapsed .basic-layout__sidebar-collapse .el-icon {
  font-size: 18px;
}
/* 设计（节点04）：管理端侧栏加宽至 236px（组盒 212 + 右缘 24 对齐设计帧）；折叠态除外 */
.basic-layout__aside--admin:not(.basic-layout__aside--collapsed) {
  flex-basis: 236px;
  width: 236px;
}
/* 0.2.0 新稿（458:12701）：管理端侧栏改为浅色表面，用户端仍为深色导航阶 */
.basic-layout__aside--admin {
  box-sizing: border-box;
  background: var(--sw-nav-sidebar-light-bg);
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
/* P62 复核01 G6：≤1279px 视口隐藏管理端字标后缀（负 margin 叠字），导航空间让位主项 */
@media (max-width: 1279px) {
  .basic-layout__topbar :deep(.app-logo__text) {
    display: none;
  }
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
    max-width: none;
    padding-left: 0;
    padding-right: 12px;
  }
}
</style>

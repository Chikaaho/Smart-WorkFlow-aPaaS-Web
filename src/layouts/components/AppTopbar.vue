<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Fold, Expand, CaretBottom, UserFilled, SwitchButton } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { useMenuStore } from '@/stores/menu'
import { useUserStore } from '@/stores/user'
import { useAuth } from '@/foundation/auth'
import { clearDynamicRoutes } from '@/router/guard'
import { buildMenuTrail } from '../menu-utils'

// 顶栏三件套（决策文档 · 外壳刀 §5）：折叠按钮 / 极简面包屑 / 用户下拉（退出走既有 logout seam）。
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const menuStore = useMenuStore()
const userStore = useUserStore()
const { logout } = useAuth()

const collapsed = computed(() => appStore.sidebarCollapsed)
const breadcrumb = computed(() => buildMenuTrail(menuStore.menu, route.path))
const displayName = computed(() => userStore.user?.displayName || '未登录')

async function onLogout(): Promise<void> {
  // 复用 logout() seam（清 token）+ 撤销动态路由/清会话，保证重新登录后用新数据重建。
  await logout()
  clearDynamicRoutes(router)
  await router.push('/login')
}

function onCommand(command: string): void {
  if (command === 'logout') {
    void onLogout()
  }
}
</script>

<template>
  <div class="app-topbar">
    <el-button
      text
      class="app-topbar__collapse"
      aria-label="toggle sidebar"
      @click="appStore.toggleSidebar()"
    >
      <el-icon :size="18"><component :is="collapsed ? Expand : Fold" /></el-icon>
    </el-button>

    <el-breadcrumb class="app-topbar__breadcrumb" separator="/">
      <el-breadcrumb-item v-for="node in breadcrumb" :key="node.id">
        {{ node.title }}
      </el-breadcrumb-item>
    </el-breadcrumb>

    <div class="app-topbar__spacer" />

    <el-dropdown trigger="click" @command="onCommand">
      <span class="app-topbar__user">
        <el-avatar :size="28" :icon="UserFilled" />
        <span class="app-topbar__user-name">{{ displayName }}</span>
        <el-icon><CaretBottom /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="logout" :icon="SwitchButton">退出登录</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.app-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 100%;
}
.app-topbar__spacer {
  flex: 1;
}
.app-topbar__user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  outline: none;
}
.app-topbar__user-name {
  font-size: 14px;
}
</style>

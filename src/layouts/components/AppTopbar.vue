<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bell,
  CaretBottom,
  Search,
  SwitchButton,
  OfficeBuilding,
  HomeFilled,
} from '@element-plus/icons-vue'
import { useI18n } from '@/locales'
import { useMenuStore } from '@/stores/menu'
import { useUserStore } from '@/stores/user'
import { useAuth } from '@/foundation/auth'
import { clearDynamicRoutes } from '@/router/guard'
import { canEnterAdminArea, firstAdminLeafPath, resolveArea } from '@/foundation/area'
import { buildMenuTrail } from '../menu-utils'
import { useLocalizedMenuTree } from '../menu-title'
import { unreadNotifyCount } from '@/modules/notify/api'
import LocaleSwitch from '@/components/LocaleSwitch.vue'
import { activeDesignFixtureFlag } from '@/foundation/design-fixture-flag'

/**
 * 顶栏工具区（P53 设计节点 01/28/29/30/32）：通知铃铛 / 语言切换 / 用户下拉。
 * 前后台切换移入用户下拉（「进入后台 / 返回前台」，语义与既有 area 机制一致）；
 * 菜单、权限仍为服务端下发单源，本组件不引入第二事实源。
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const menuStore = useMenuStore()
const userStore = useUserStore()
const { logout } = useAuth()
// P53 DESIGN_FIDELITY：仅 fixture 会话非空（dev:mock + capture 注入），生产恒为 null。
const designFixture = activeDesignFixtureFlag()

const localizedMenu = useLocalizedMenuTree(computed(() => menuStore.menu))
const displayName = computed(() => userStore.user?.displayName || t('auth.notSignedIn'))
const avatarText = computed(() => displayName.value.slice(0, 1).toUpperCase())

// 通知铃铛：仅在服务端菜单树含收件箱入口时显示；未读数失败静默为 0（顶栏韧性）。
const bellVisible = computed(() => {
  const trail = buildMenuTrail(localizedMenu.value, '/notify/inbox')
  return trail.length > 0
})
const unread = ref(0)
onMounted(() => {
  if (!bellVisible.value) return
  unreadNotifyCount()
    .then((count) => {
      unread.value = count
    })
    .catch(() => {
      unread.value = 0
    })
})

const currentArea = computed(() => resolveArea(route.path))
const adminCapable = computed(() => canEnterAdminArea())
const showEnterAdmin = computed(() => currentArea.value === 'portal' && adminCapable.value)

function onEnterAdmin(): void {
  const target = firstAdminLeafPath()
  void router.push(target ?? '/form/form-def-list')
}

function onBackPortal(): void {
  void router.push('/workspace')
}

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
  if (command === 'account-bindings') {
    void router.push('/account/bindings')
  }
  if (command === 'enter-admin') {
    onEnterAdmin()
  }
  if (command === 'back-portal') {
    onBackPortal()
  }
}
</script>

<template>
  <div class="app-topbar">
    <span v-if="designFixture" class="app-topbar__search" aria-hidden="true">
      <el-icon :size="18"><Search /></el-icon>
    </span>
    <router-link
      v-if="bellVisible"
      to="/notify/inbox"
      class="app-topbar__bell"
      :aria-label="t('nav.notifications')"
    >
      <el-badge :value="unread" :hidden="unread <= 0" :max="99">
        <el-icon :size="18"><Bell /></el-icon>
      </el-badge>
    </router-link>

    <div v-if="!designFixture" class="app-topbar__locale">
      <LocaleSwitch />
    </div>

    <el-dropdown trigger="click" @command="onCommand">
      <span class="app-topbar__user">
        <span class="app-topbar__avatar" aria-hidden="true">{{ avatarText }}</span>
        <span class="app-topbar__user-name">{{ displayName }}</span>
        <el-icon class="app-topbar__caret"><CaretBottom /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu class="app-topbar__dropdown">
          <el-dropdown-item command="account-bindings">{{
            t('auth.accountBindings')
          }}</el-dropdown-item>
          <el-dropdown-item v-if="showEnterAdmin" command="enter-admin" :icon="OfficeBuilding">
            {{ t('auth.enterBackend') }}
          </el-dropdown-item>
          <el-dropdown-item v-if="currentArea === 'admin'" command="back-portal" :icon="HomeFilled">
            {{ t('auth.backToPortal') }}
          </el-dropdown-item>
          <el-dropdown-item
            command="logout"
            :icon="SwitchButton"
            divided
            class="app-topbar__logout"
          >
            {{ t('auth.signOut') }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
.app-topbar {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 100%;
}
.app-topbar__bell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--sw-radius-base);
  color: rgba(255, 255, 255, 0.9);
}
.app-topbar__bell:hover {
  color: #ffffff;
  background: var(--sw-nav-hover-bg);
}
.app-topbar__search {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--sw-radius-base);
  color: rgba(255, 255, 255, 0.9);
}
.app-topbar__locale {
  min-width: 0;
}
.app-topbar__locale :deep(.el-select) {
  --el-fill-color-blank: transparent;
}
.app-topbar__locale :deep(.el-select__wrapper) {
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25) inset;
  color: #ffffff;
  min-height: 32px;
}
.app-topbar__locale :deep(.el-select__placeholder),
.app-topbar__locale :deep(.el-select__selected-item) {
  color: #ffffff;
}
.app-topbar__user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  outline: none;
}
.app-topbar__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--sw-color-primary);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
}
.app-topbar__user-name {
  font-size: 14px;
  color: #ffffff;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-topbar__caret {
  color: rgba(255, 255, 255, 0.9);
}
.app-topbar__logout {
  color: var(--sw-danger);
}
.app-topbar__logout :deep(.el-icon) {
  color: var(--sw-danger);
}
</style>

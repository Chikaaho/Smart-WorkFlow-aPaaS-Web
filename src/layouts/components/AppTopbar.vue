<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Back, Switch, SwitchButton, User } from '@element-plus/icons-vue'
import { useI18n } from '@/locales'
import { SUPPORTED_LOCALES, setLocale, type AppLocale } from '@/locales'
import { useMenuStore } from '@/stores/menu'
import { useUserStore } from '@/stores/user'
import { useAuth } from '@/foundation/auth'
import { clearDynamicRoutes } from '@/router/guard'
import { canEnterAdminArea, firstAdminLeafPath, resolveArea } from '@/foundation/area'
import { buildMenuTrail } from '../menu-utils'
import { useLocalizedMenuTree } from '../menu-title'
import ThemeDialog from './ThemeDialog.vue'
import ChangePasswordDialog from './ChangePasswordDialog.vue'
import DetailDialog from '@/components/DetailDialog.vue'
import operationManual from '../../../docs/user-guide/operation-manual.md?raw'
import searchIcon from '@/assets/brand/search-020.svg'
import bellIcon from '@/assets/brand/bell-020.svg'
import arrowIcon from '@/assets/brand/arrow-down-020.svg'
import {
  unreadNotifyCount,
  pageNotifyInbox,
  markAsRead,
  openNotifyLink,
} from '@/modules/notify/api'

/**
 * 顶栏工具区（P53 设计节点 01/28/29/30/32）：语言切换 / 搜索 / 通知铃铛 / 用户下拉。
 * V011-BUG-005：多语言入口上移到顶栏（主导航与搜索之间），不再内聚在下拉摘要行
 * （P61 §3.3 能力保持：setLocale 继续同步 Web/Element/Server 消息语言）。
 * V011-BUG-004：用户下拉去掉身份/空间摘要头与大按钮盒，仅保留三个小菜单项
 * （账号绑定 / 进入后台或返回前台 / 退出登录）。
 * 菜单、权限仍为服务端下发单源，本组件不引入第二事实源。
 */
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const menuStore = useMenuStore()
const userStore = useUserStore()
const { logout } = useAuth()

const localizedMenu = useLocalizedMenuTree(computed(() => menuStore.menu))
const displayName = computed(() => userStore.user?.displayName || t('auth.notSignedIn'))
const avatarText = computed(() => displayName.value.slice(0, 1).toUpperCase())
const themeVisible = ref(false)
const manualVisible = ref(false)
const passwordVisible = ref(false)
const manualLines = operationManual.split('\n')

// 通知铃铛：仅在服务端菜单树含收件箱入口时显示；未读数失败静默为 0（顶栏韧性）。
const bellVisible = computed(() => {
  const trail = buildMenuTrail(localizedMenu.value, '/notify/inbox')
  return trail.length > 0
})
const unread = ref(0)

// ─── 铃铛通知面板（V012-BUG-007）：未读红点列表，最多 5 条，右下角查看全部 ───
interface BellItem {
  id: number
  title: string
  createTime: string
  read: boolean
}
const panelVisible = ref(false)
const panelLoading = ref(false)
const panelItems = ref<BellItem[]>([])

async function loadPanel(): Promise<void> {
  panelLoading.value = true
  try {
    const page = await pageNotifyInbox({ pageNum: 1, pageSize: 5 })
    panelItems.value = page.list.map((m) => ({
      id: m.id,
      title: m.title,
      createTime: m.createTime,
      read: m.read,
    }))
  } catch {
    panelItems.value = []
  } finally {
    panelLoading.value = false
  }
}

async function refreshUnread(): Promise<void> {
  try {
    unread.value = await unreadNotifyCount()
  } catch {
    /* 未读数失败静默（顶栏韧性，不变更既有语义） */
  }
}

function onPanelShow(): void {
  void loadPanel()
  void refreshUnread()
}

/** 面板条目点击：跳转受控深链；未读行先标记已读并即时刷新红点与未读数。 */
async function openPanelItem(item: BellItem): Promise<void> {
  panelVisible.value = false
  try {
    const target = await openNotifyLink(item.id)
    if (!item.read) {
      item.read = true
      void refreshUnread()
    }
    if (target.linkType === 'WF_TASK' || target.linkType === 'WF_PROCESS') {
      await router.push({ path: '/workflow/instances', query: { focus: target.linkId } })
      return
    }
    // 无受控深链的消息：点击即视为已读，停留在当前页
    if (!item.read) await markAsRead(item.id)
  } catch {
    /* 深链鉴权失败等：面板已关闭，不打断当前页 */
  }
}

function onViewAll(): void {
  panelVisible.value = false
  void router.push('/notify/inbox')
}

const currentArea = computed(() => resolveArea(route.path))
const adminCapable = computed(() => canEnterAdminArea())
const showEnterAdmin = computed(() => currentArea.value === 'portal' && adminCapable.value)

const localeOptions = SUPPORTED_LOCALES.map((value) => ({ value, label: t(`locale.${value}`) }))
const currentLocale = computed(() => locale.value)
const currentLocaleLabel = computed(
  () => localeOptions.find((option) => option.value === currentLocale.value)?.label ?? '',
)
function onLocale(value: AppLocale): void {
  setLocale(value)
}

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

async function onPasswordChanged(): Promise<void> {
  passwordVisible.value = false
  clearDynamicRoutes(router)
  await router.push('/login')
}

function onCommand(command: string): void {
  if (command === 'manual') manualVisible.value = true
  if (command === 'change-password') passwordVisible.value = true
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
  <div class="app-topbar" :class="`app-topbar--${currentArea}`">
    <span
      v-if="currentArea === 'admin' && userStore.user?.tenantId != null"
      class="app-topbar__tenant"
    >
      {{
        t(userStore.superAdmin ? 'nav.superTenant' : 'nav.tenant', {
          tenant: userStore.user?.tenantId,
        })
      }}
    </span>
    <button class="app-topbar__theme" type="button" @click="themeVisible = true">
      {{ t('common.theme') }}
    </button>
    <!-- 参考 4:2/6:2/97:2：“中文”后无下拉指示（下拉仍由点击触发） -->
    <el-dropdown trigger="click" @command="onLocale">
      <button class="app-topbar__locale" type="button" :aria-label="t('locale.switch')">
        <span class="app-topbar__locale-current">{{ currentLocaleLabel }}</span>
      </button>
      <template #dropdown>
        <el-dropdown-menu class="app-topbar__locale-menu">
          <el-dropdown-item
            v-for="option in localeOptions"
            :key="option.value"
            :command="option.value"
            :class="{ 'is-current': option.value === currentLocale }"
          >
            {{ option.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <span class="app-topbar__search" aria-hidden="true">
      <img v-if="currentArea === 'admin'" :src="searchIcon" alt="" width="18" height="18" />
      <!-- P53 设计同源图标：路径取自锁定 SVG（1225,23 20×20 / 1263,23 20×20） -->
      <svg v-else viewBox="1225 22 20 20" width="20" height="20" fill="none" aria-hidden="true">
        <path
          d="M1234.17 38.0002C1237.39 38.0002 1240 35.3885 1240 32.1668C1240 28.9452 1237.39 26.3335 1234.17 26.3335C1230.95 26.3335 1228.33 28.9452 1228.33 32.1668C1228.33 35.3885 1230.95 38.0002 1234.17 38.0002Z"
          stroke="currentColor"
          stroke-width="1.41667"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M1238.33 36.3335L1241.67 39.6668"
          stroke="currentColor"
          stroke-width="1.41667"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <!-- 铃铛通知面板（V012-BUG-007）：未读红点列表最多 5 条，右下角查看全部 -->
    <el-popover
      v-if="bellVisible"
      v-model:visible="panelVisible"
      trigger="click"
      placement="bottom-end"
      :width="340"
      popper-class="app-bell-popover"
      @show="onPanelShow"
    >
      <template #reference>
        <button class="app-topbar__bell" type="button" :aria-label="t('nav.notifications')">
          <el-badge :value="unread" :hidden="unread <= 0" :max="99">
            <img v-if="currentArea === 'admin'" :src="bellIcon" alt="" width="18" height="18" />
            <svg
              v-else
              viewBox="1263 22 20 20"
              width="20"
              height="20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1278 29.6665C1278 28.3404 1277.47 27.0687 1276.54 26.131C1275.6 25.1933 1274.33 24.6665 1273 24.6665C1271.67 24.6665 1270.4 25.1933 1269.46 26.131C1268.53 27.0687 1268 28.3404 1268 29.6665C1268 35.4998 1265.5 35.4998 1265.5 37.1665H1280.5C1280.5 35.4998 1278 35.4998 1278 29.6665Z"
                stroke="currentColor"
                stroke-width="1.41667"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M1271.33 40.5H1274.67"
                stroke="currentColor"
                stroke-width="1.41667"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </el-badge>
        </button>
      </template>
      <div class="app-bell-panel">
        <p class="app-bell-panel__title">{{ t('nav.notifications') }}</p>
        <div v-loading="panelLoading" class="app-bell-panel__body">
          <p v-if="!panelLoading && panelItems.length === 0" class="app-bell-panel__empty">
            {{ t('notify.noUnreadNotifications') }}
          </p>
          <button
            v-for="item in panelItems"
            :key="item.id"
            class="app-bell-panel__item"
            type="button"
            @click="openPanelItem(item)"
          >
            <span
              class="app-bell-panel__dot"
              :class="{ 'is-read': item.read }"
              aria-hidden="true"
            />
            <span class="app-bell-panel__item-main">
              <span class="app-bell-panel__item-title">{{ item.title }}</span>
              <span class="app-bell-panel__item-time">{{ item.createTime }}</span>
            </span>
          </button>
        </div>
        <div class="app-bell-panel__footer">
          <el-button link type="primary" @click="onViewAll">{{ t('common.viewAll') }}</el-button>
        </div>
      </div>
    </el-popover>

    <el-dropdown trigger="click" @command="onCommand">
      <span class="app-topbar__user" :aria-label="displayName">
        <span class="app-topbar__avatar" aria-hidden="true">{{ avatarText }}</span>
        <span class="app-topbar__user-name">{{ displayName }}</span>
        <img class="app-topbar__caret" :src="arrowIcon" alt="" width="12" height="12" />
      </span>
      <template #dropdown>
        <!-- V011-BUG-004：仅三个小菜单项，无摘要头 -->
        <el-dropdown-menu class="app-topbar__dropdown">
          <el-dropdown-item command="manual">{{ t('nav.operationManual') }}</el-dropdown-item>
          <el-dropdown-item command="account-bindings">
            <el-icon :size="14"><User /></el-icon>
            {{ t('auth.accountBindings') }}
          </el-dropdown-item>
          <el-dropdown-item command="change-password">{{
            t('auth.changePassword')
          }}</el-dropdown-item>
          <el-dropdown-item v-if="showEnterAdmin" command="enter-admin">
            <el-icon :size="14"><Switch /></el-icon>
            {{ t('auth.enterBackend') }}
          </el-dropdown-item>
          <el-dropdown-item v-if="currentArea === 'admin'" command="back-portal">
            <el-icon :size="14"><Back /></el-icon>
            {{ t('auth.backToPortal') }}
          </el-dropdown-item>
          <el-dropdown-item command="logout" divided class="app-topbar__logout">
            <el-icon :size="14" class="app-topbar__logout-icon"><SwitchButton /></el-icon>
            {{ t('auth.signOut') }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <ThemeDialog v-model="themeVisible" />
    <ChangePasswordDialog v-model="passwordVisible" @changed="onPasswordChanged" />
    <DetailDialog v-model="manualVisible" :title="t('nav.operationManual')" width="920px">
      <article class="app-topbar__manual">
        <template v-for="(line, index) in manualLines" :key="index">
          <h3 v-if="line.startsWith('## ')">{{ line.slice(3) }}</h3>
          <p v-else-if="line && !line.startsWith('# ')">{{ line }}</p>
        </template>
      </article>
    </DetailDialog>
  </div>
</template>

<style scoped>
.app-topbar {
  display: flex;
  align-items: center;
  /* 设计（节点02）：搜索/铃铛/用户区间距 18px，个人区总宽 336 */
  gap: 18px;
  height: 100%;
}
.app-topbar__theme {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--sw-surface-card);
  font: inherit;
  font-size: var(--sw-font-caption);
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
}
.app-topbar__tenant {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 88px;
  height: 24px;
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
  border-radius: var(--sw-radius-base);
  font-size: var(--sw-font-caption);
  white-space: nowrap;
}
.app-topbar--admin {
  gap: var(--sw-space-8);
}
.app-topbar--admin .app-topbar__locale {
  padding: 0;
  font-size: 12px;
}
.app-topbar--admin .app-topbar__search,
.app-topbar--admin .app-topbar__bell {
  width: 18px;
  height: 18px;
}
.app-topbar--admin .app-topbar__user {
  gap: 8px;
  width: 110px;
}
.app-topbar--admin .app-topbar__avatar {
  border-radius: var(--sw-radius-base);
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-weight: 500;
  transform: none;
}
.app-topbar__manual {
  color: var(--sw-text-primary);
  line-height: 1.7;
}
.app-topbar__manual h3 {
  color: var(--sw-color-primary);
}
.app-topbar__bell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.9);
}
.app-topbar__bell:focus-visible {
  outline: 2px solid var(--sw-color-primary-light-3, #a56e97);
}
.app-topbar__bell :deep(svg) {
  transform: translateY(2px);
}
.app-topbar__bell:hover {
  color: #ffffff;
  background: var(--sw-nav-hover-bg);
}
/* ── 铃铛通知面板（V012-BUG-007） ── */
.app-bell-panel {
  display: flex;
  flex-direction: column;
}
.app-bell-panel__title {
  margin: 0;
  padding: 4px 4px 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-text-primary);
  border-bottom: 1px solid var(--sw-border-light, #ebeef5);
}
.app-bell-panel__body {
  min-height: 64px;
  max-height: 320px;
  overflow-y: auto;
}
.app-bell-panel__empty {
  margin: 0;
  padding: 20px 4px;
  text-align: center;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.app-bell-panel__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 4px;
  border: none;
  border-bottom: 1px solid var(--sw-border-extra-light, #f5f7fa);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.app-bell-panel__item:last-child {
  border-bottom: none;
}
.app-bell-panel__item:hover {
  background: var(--sw-color-primary-soft);
}
.app-bell-panel__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--el-color-primary);
}
.app-bell-panel__dot.is-read {
  background: transparent;
}
.app-bell-panel__item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.app-bell-panel__item-title {
  font-size: 13px;
  color: var(--sw-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-bell-panel__item-time {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.app-bell-panel__footer {
  display: flex;
  justify-content: flex-end;
  padding: 6px 4px 0;
  border-top: 1px solid var(--sw-border-light, #ebeef5);
}
.app-topbar__search {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--sw-radius-base);
  color: rgba(255, 255, 255, 0.9);
}
.app-topbar__user {
  display: flex;
  align-items: center;
  /* 参考 4:2/6:2/97:2 账户入口：110×40 容器，头像 32 + 8 间距 + 名称槽 28 + 8 间距 + chevron 12 */
  width: 110px;
  gap: 8px;
  cursor: pointer;
  outline: none;
}
.app-topbar__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--sw-color-primary);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  transform: translateY(1px);
}
.app-topbar__user-name {
  flex: 0 0 28px;
  width: 28px;
  font-size: 14px;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.app-topbar__caret {
  /* 参考：用户名后细线 chevron（12px 盒，可见笔画约 10px） */
  flex: 0 0 12px;
}
.app-topbar__logout {
  color: var(--sw-danger);
}
.app-topbar__logout :deep(.el-icon) {
  color: var(--sw-danger);
}
/* V011-BUG-005：顶栏语言切换（主导航与搜索之间，深色顶栏上的白色文字控件）
 * 参考 4:2/6:2/97:2：中文 12px，文本后无指示图标，控件无横向内距（与搜索图标间距 8） */
.app-topbar__locale {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
  font-family: var(--sw-font-family);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
}
.app-topbar__locale:hover {
  background: var(--sw-nav-hover-bg);
  color: #ffffff;
}
</style>

<style>
.el-popper:has(.app-topbar__locale-menu) .el-popper__arrow {
  display: none !important;
}
.app-topbar__locale-menu .el-dropdown-menu__item.is-current {
  color: var(--sw-color-primary);
  font-weight: 600;
  background: var(--sw-color-primary-soft);
}
/* 铃铛通知面板 popper（V012-BUG-007）：白卡 + 无箭头 */
.el-popper.app-bell-popover {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #dfe6f2;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.el-popper.app-bell-popover .el-popper__arrow {
  display: none !important;
}
</style>

<style>
.el-popper:has(.app-topbar__dropdown) .el-popper__arrow {
  display: none !important;
}
.el-popper:has(.app-topbar__dropdown) {
  position: fixed !important;
  top: 74px !important;
  right: 24px !important;
  left: auto !important;
  transform: none !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}
/* V011-BUG-004：个人菜单收敛为白卡内三个小菜单项（无摘要头、无描边按钮盒）。 */
.app-topbar__dropdown.el-dropdown-menu {
  width: 200px;
  box-sizing: border-box;
  padding: 8px;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid #dfe6f2;
  box-shadow: 0 2px 7px rgba(0, 0, 0, 0.08);
}
.app-topbar__dropdown .el-dropdown-menu__item {
  height: 32px;
  line-height: 32px;
  margin: 2px 0 0;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  font-size: 13px;
  justify-content: flex-start;
}
.app-topbar__dropdown .el-dropdown-menu__item:not(.is-disabled):hover {
  background: var(--sw-color-primary-soft);
}
.app-topbar__dropdown .app-topbar__logout {
  color: #e04b55;
}
@media (max-width: 767px) {
  .app-topbar {
    gap: 8px;
  }
  .app-topbar__search,
  .app-topbar__user-name,
  .app-topbar__caret {
    display: none;
  }
  .app-topbar__user {
    gap: 0;
  }
}
</style>

<style scoped>
.app-topbar--portal {
  gap: var(--sw-space-8);
}
.app-topbar--portal .app-topbar__avatar {
  flex: 0 0 32px;
  border-radius: var(--sw-radius-base);
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-weight: var(--sw-font-weight-emphasis);
  transform: none;
}
.app-topbar--portal .app-topbar__user {
  width: 110px;
  gap: 8px;
}
.app-topbar--portal .app-topbar__user-name {
  flex: 0 0 28px;
  width: 28px;
  font-weight: var(--sw-font-weight-body);
}
.app-topbar--portal .app-topbar__search,
.app-topbar--portal .app-topbar__bell {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'

// 左上角品牌 logo：资源与文案只在本组件维护，不写死进其它位置。
// 图形复用原生品牌资产，文字使用当前设计字体。
import adminLogoUrl from '@/assets/brand/logo-020.png'

const props = defineProps<{ collapse: boolean; area: 'portal' | 'admin' }>()
const { t } = useI18n()
const brandLabel = computed(() => t(props.area === 'admin' ? 'nav.brandAdmin' : 'nav.brandPortal'))
</script>

<template>
  <div
    class="app-logo"
    :class="[{ 'app-logo--collapse': collapse }, `app-logo--${area}`]"
    role="img"
    :aria-label="brandLabel"
  >
    <template v-if="area === 'admin'">
      <span class="app-logo__admin-mark"
        ><img :src="adminLogoUrl" alt="" width="30" height="32"
      /></span>
      <span class="app-logo__text">{{ brandLabel }}</span>
    </template>
    <template v-else>
      <span class="app-logo__portal-mark"
        ><img :src="adminLogoUrl" alt="" width="30" height="32"
      /></span>
      <span class="app-logo__text app-logo__portal-text">{{ brandLabel }}</span>
    </template>
  </div>
</template>

<style scoped>
.app-logo {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  /* 0.2.0 参考：品牌列独立 224（顶栏导航起点 x263），侧栏 236 由 aside token 管理 */
  flex: 0 0 var(--sw-layout-logo-width, 224px);
  gap: 13px;
  height: 64px;
  width: var(--sw-layout-logo-width, 224px);
  padding: 0 0 0 24px;
  overflow: hidden;
}
.app-logo--collapse {
  flex-basis: 48px;
  width: 48px;
  justify-content: center;
  padding: 0;
}
.app-logo__portal-mark {
  display: flex;
  flex: 0 0 34px;
  align-items: center;
  justify-content: center;
  height: 36px;
  background: var(--sw-surface-card);
  border-radius: var(--sw-radius-base);
}
.app-logo--portal {
  gap: 10px;
}
.app-logo--portal .app-logo__portal-text {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.app-logo__text {
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-nav-text);
  white-space: nowrap;
}
.app-logo--admin {
  /* 0.1.7 #5：管理端侧栏 236px（BasicLayout .basic-layout__aside--admin 同值） */
  flex-basis: 236px;
  width: 236px;
  gap: 10px;
  height: 40px;
  padding: 0;
}
.app-logo--admin .app-logo__text {
  font-size: var(--sw-font-h2);
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 24px;
}
.app-logo__admin-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 34px;
  height: 36px;
  background: var(--sw-surface-card);
  border-radius: var(--sw-radius-base);
}
</style>

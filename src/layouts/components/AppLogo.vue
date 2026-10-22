<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'

// 左上角品牌 logo：资源与文案只在本组件维护，不写死进其它位置。
// mark/wordmark 资产为 P53 锁定设计包原生裁切（docs/ui/png 24,12 40×42 / 77,20 90×26），与设计逐像素同源。
import logoUrl from '@/assets/brand/logo-block.png'
import wordmarkUrl from '@/assets/brand/wordmark.png'
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
      <img class="app-logo__mark-frame" :src="logoUrl" alt="" />
      <img class="app-logo__wordmark" :src="wordmarkUrl" alt="" />
    </template>
  </div>
</template>

<style scoped>
.app-logo {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  /* 0.1.7 #5：品牌列宽度与深色侧栏同源对齐（portal=--sw-layout-aside-width 224px），
     多分辨率下跟随同一 token，不再用独立 240px 定宽错位 */
  flex: 0 0 var(--sw-layout-aside-width);
  gap: 13px;
  height: 64px;
  width: var(--sw-layout-aside-width);
  padding: 0 0 0 24px;
  overflow: hidden;
}
.app-logo--collapse {
  flex-basis: 48px;
  width: 48px;
  justify-content: center;
  padding: 0;
}
.app-logo__mark-frame {
  box-sizing: border-box;
  background-color: #ffffff;
  display: inline-flex;
  flex: 0 0 40px;
  width: 40px;
  height: 42px;
  margin-top: 2px;
  border-radius: 8px;
}
.app-logo__wordmark {
  flex: 0 0 auto;
  width: 90px;
  height: 26px;
  margin-top: 2px;
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
.app-logo--admin .app-logo__wordmark {
  width: 70px;
  height: 20px;
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

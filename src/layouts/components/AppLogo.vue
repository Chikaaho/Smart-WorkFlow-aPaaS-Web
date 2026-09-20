<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'

// 左上角品牌 logo：资源与文案只在本组件维护，不写死进其它位置。
// mark/wordmark 资产为 P53 锁定设计包原生裁切（docs/ui/png 24,12 40×42 / 77,20 90×26），与设计逐像素同源。
import logoUrl from '@/assets/brand/logo-block.png'
import wordmarkUrl from '@/assets/brand/wordmark.png'

const props = defineProps<{ collapse: boolean; area: 'portal' | 'admin' }>()
const { t } = useI18n()
const brandLabel = computed(() => t(props.area === 'admin' ? 'nav.brandAdmin' : 'nav.brandPortal'))
// 管理端字标 = 同一 wordmark 资产 + 语言文本后缀（zh:· 管理端 / en:· Admin）
const brandAdminSuffix = computed(() =>
  t('nav.brandAdmin').replace(t('nav.brandPortal'), '').trim(),
)
</script>

<template>
  <div
    class="app-logo"
    :class="[{ 'app-logo--collapse': collapse }, `app-logo--${area}`]"
    role="img"
    :aria-label="brandLabel"
  >
    <img class="app-logo__mark-frame" :src="logoUrl" alt="" />
    <img class="app-logo__wordmark" :src="wordmarkUrl" alt="" />
    <span v-if="area === 'admin'" class="app-logo__text">{{ brandAdminSuffix }}</span>
  </div>
</template>

<style scoped>
.app-logo {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  flex: 0 0 240px;
  gap: 13px;
  height: 64px;
  width: 240px;
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
  gap: 12px;
}
.app-logo--admin .app-logo__wordmark {
  width: 70px;
  height: 20px;
}
.app-logo--admin .app-logo__text {
  margin-left: -8px;
  font-size: 13px;
}
</style>

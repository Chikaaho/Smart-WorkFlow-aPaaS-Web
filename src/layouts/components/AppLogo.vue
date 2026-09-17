<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'

// 左上角品牌 logo：资源与文案只在本组件维护，不写死进其它位置。
// 折叠态只留 mark 图、隐藏文字。mark 资产来自 P53 设计包（docs/ui/svg/01 工作台.svg 内嵌位图提取）。
import logoUrl from '@/assets/brand/logo-mark.png'

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
    <span class="app-logo__mark-frame">
      <img class="app-logo__mark" :src="logoUrl" alt="" />
    </span>
    <span v-show="!collapse" class="app-logo__text">{{ brandLabel }}</span>
  </div>
</template>

<style scoped>
.app-logo {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  flex: 0 0 224px;
  gap: 12px;
  height: 64px;
  width: 224px;
  padding: 0 0 0 8px;
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
  display: inline-flex;
  flex: 0 0 40px;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 42px;
  overflow: hidden;
  border-radius: 8px;
  background: #ffffff;
}
.app-logo__mark {
  flex: 0 0 auto;
  width: 32px;
  height: 36px;
  object-fit: contain;
}
.app-logo__text {
  font-size: 18px;
  font-weight: 600;
  color: var(--sw-nav-text);
  white-space: nowrap;
}
.app-logo--admin .app-logo__text {
  font-size: 14px;
}
</style>

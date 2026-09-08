<script setup lang="ts">
// 左上角品牌 logo：资源与文案只在本组件维护，不写死进其它位置。
// 折叠态只留 mark 图、隐藏文字。
import logoUrl from '@/assets/logo.png'

defineProps<{ collapse: boolean }>()
</script>

<template>
  <div class="app-logo" :class="{ 'app-logo--collapse': collapse }">
    <img class="app-logo__mark" :src="logoUrl" alt="CH-aPaaS" />
    <span v-show="!collapse" class="app-logo__text">CH-aPaaS</span>
  </div>
</template>

<style scoped>
.app-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 16px;
  overflow: hidden;
}
.app-logo--collapse {
  justify-content: center;
  padding: 0;
}
.app-logo__mark {
  flex: 0 0 auto;
  width: 30px;
  height: 32px;
  object-fit: contain;
}
.app-logo__text {
  font-size: 16px;
  font-weight: 600;
  color: var(--sw-color-primary);
  white-space: nowrap;
}
</style>

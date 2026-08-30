<script setup lang="ts">
// 左上角 logo 占位（决策文档 · 外壳刀 §2）。折叠态只留方块 mark、隐藏文字。
// TODO(skeleton): 替换为真实 logo 资源——换图只改本组件，不写死进其它位置。
defineProps<{ collapse: boolean }>()
</script>

<template>
  <div class="app-logo" :class="{ 'app-logo--collapse': collapse }">
    <span class="app-logo__mark">SW</span>
    <span v-show="!collapse" class="app-logo__text">Smart-WorkFlow</span>
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
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--sw-color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.app-logo__text {
  font-size: 16px;
  font-weight: 600;
  color: var(--sw-color-primary);
  white-space: nowrap;
}
</style>

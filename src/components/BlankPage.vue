<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'
import { useRoute } from 'vue-router'
import { useNodeTitle } from '@/layouts/menu-title'

/**
 * BlankPage — 尚未实现业务内容的占位页。
 *
 * 标题解析走与侧边栏同一套语义键（`useNodeTitle`），不直接渲染 `route.meta.title`：
 * 后者是路由建立时从服务端菜单快照固化的字符串，切换语言后不会重新求值，
 * 会在英文界面残留中文菜单名（R7-C「英文静态文案零中文」）。菜单 `name` 缺失时
 * 才回退到服务端标题。
 */
const { t } = useI18n()
const route = useRoute()
const resolveNodeTitle = useNodeTitle()

const title = computed(() => {
  const menuName = route.meta.menuName as string | undefined
  const serverTitle = route.meta.title as string | undefined
  // 渲染期求值：菜单名走语义键，缺菜单名时才回退服务端标题 / 通用占位文案
  return menuName
    ? resolveNodeTitle({ name: menuName, title: serverTitle ?? t('page.placeholder') })
    : (serverTitle ?? t('page.placeholder'))
})
</script>

<template>
  <div class="blank-page">
    <p>{{ title }}</p>
    <!-- TODO(skeleton): 业务内容待后续迭代实现 -->
  </div>
</template>

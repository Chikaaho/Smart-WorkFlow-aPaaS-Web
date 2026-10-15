<script setup lang="ts">
import { computed } from 'vue'
import { resolveAppColor, resolveAppIcon } from '@/modules/form/utils/app-icons'

/**
 * AppIcon — 应用图标（白名单解析 + 主题色底）。
 * 后台应用管理与用户端应用中心共用同一渲染口径。
 */
const props = withDefaults(
  defineProps<{
    icon?: string | null
    color?: string | null
    size?: number
  }>(),
  { icon: null, color: null, size: 18 },
)

const resolved = computed(() => resolveAppIcon(props.icon))
</script>

<template>
  <span
    class="app-icon"
    :style="{ '--app-icon-color': resolveAppColor(color), '--app-icon-size': `${size}px` }"
  >
    <component :is="resolved" />
  </span>
</template>

<style scoped>
.app-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--app-icon-size) * 2);
  height: calc(var(--app-icon-size) * 2);
  border-radius: 8px;
  color: #fff;
  background: var(--app-icon-color);
  flex: none;
}
.app-icon :deep(svg) {
  width: var(--app-icon-size);
  height: var(--app-icon-size);
}
</style>

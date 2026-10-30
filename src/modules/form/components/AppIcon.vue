<script setup lang="ts">
import { computed } from 'vue'
import {
  resolveAppColor,
  resolveAppIcon,
  ICON_ASSETS,
  iconMask,
} from '@/modules/form/utils/app-icons'

/**
 * AppIcon — 应用图标（白名单解析 + 主题色底）。
 * 后台应用管理与用户端应用中心共用同一渲染口径。
 */
const props = withDefaults(
  defineProps<{
    icon?: string | null
    color?: string | null
    size?: number
    soft?: boolean
    boxSize?: number
  }>(),
  { icon: null, color: null, size: 18, soft: false, boxSize: undefined },
)

const resolved = computed(() => resolveAppIcon(props.icon))
</script>

<template>
  <span
    class="app-icon"
    :class="{ 'app-icon--soft': soft }"
    :style="{
      '--app-icon-color': resolveAppColor(color),
      '--app-icon-size': `${size}px`,
      '--app-icon-box-size': `${boxSize ?? size * 2}px`,
    }"
  >
    <span
      v-if="icon && ICON_ASSETS[icon]"
      class="app-icon__asset"
      :style="{ maskImage: iconMask(icon) }"
    />
    <component :is="resolved" v-else />
  </span>
</template>

<style scoped>
.app-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--app-icon-box-size);
  height: var(--app-icon-box-size);
  border-radius: var(--sw-radius-card);
  color: #fff;
  background: var(--app-icon-color);
  flex: none;
}
.app-icon--soft {
  color: var(--app-icon-color);
  background: color-mix(in srgb, var(--app-icon-color) 10%, white);
}
.app-icon :deep(svg) {
  width: var(--app-icon-size);
  height: var(--app-icon-size);
}
.app-icon__asset {
  width: var(--app-icon-size);
  height: var(--app-icon-size);
  background: currentColor;
  mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'
import { useUserStore } from '@/stores/user'
import type { PageExtra } from './use-workspace-data'

/**
 * 设计01 工作台（B021-007 功能遗漏回补）：查看态头部为问候行+今日统计+右上配置入口；
 * 顶层页不提供返回（B021-001）。
 */
defineProps<{
  todoTotal: number
  todoExtra: PageExtra
}>()

const emit = defineEmits<{ configure: [] }>()

const { t } = useI18n()

const userStore = useUserStore()
const displayName = computed(() => userStore.user?.displayName ?? '')
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return t('workspace.greetingMorning')
  if (hour < 18) return t('workspace.greetingAfternoon')
  return t('workspace.greetingEvening')
})
</script>

<template>
  <header class="wsd-hero" data-testid="workspace-hero">
    <h2 class="wsd-hero__greeting">{{ greeting }}{{ displayName ? '，' : '' }}{{ displayName }}</h2>
    <p class="wsd-hero__sub">
      {{ t('workspace.todoSummary', { count: todoTotal, urgent: todoExtra.urgentTotal ?? 0 }) }}
    </p>
    <button
      class="wsd-hero__config"
      type="button"
      :title="t('workspace.configureWorkspace')"
      :aria-label="t('workspace.configureWorkspace')"
      @click="emit('configure')"
    >
      <span>{{ t('workspace.configureWorkspace') }}</span>
    </button>
  </header>
</template>

<style scoped>
.wsd-hero {
  position: relative;
  height: 64px;
}
.wsd-hero__greeting {
  margin: 0;
  font-size: 24px;
  line-height: 28px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-hero__sub {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--sw-text-secondary);
}
/* 273:1600 / 3:2：右上「配置工作台」入口（原齿轮图标） */
.wsd-hero__config {
  position: absolute;
  right: 0;
  top: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--sw-border, #d9dde6);
  border-radius: 6px;
  background: var(--sw-bg-surface, #fff);
  color: var(--sw-text-primary);
  font-size: 13px;
  cursor: pointer;
}
.wsd-hero__config:hover,
.wsd-hero__config:focus-visible {
  background: var(--sw-color-primary-softer);
  color: var(--sw-color-primary);
}
</style>

<script setup lang="ts">
import { useI18n } from '@/locales'

/** 快捷发起面板：设计01 文本瓦片，只列真实收藏常用事项。 */
defineProps<{
  quickActions: Array<{ label: string; formKey: string }>
  gearClick: () => void
  openForm: (formKey: string) => void
}>()

const { t } = useI18n()
</script>

<template>
  <section class="wsd-panel wsd-panel--quick">
    <div class="wsd-panel__head">
      <h3 class="wsd-panel__title">{{ t('workspace.quickLaunch') }}</h3>
      <button class="wsd-pill" type="button" @click="gearClick">
        {{ t('workspace.manageFavorites') }}
      </button>
    </div>
    <p v-if="quickActions.length === 0" class="wsd-panel__empty">
      {{ t('workspace.noFavorites') }}
    </p>
    <div v-else class="wsd-quickgrid">
      <button
        v-for="q in quickActions"
        :key="q.formKey"
        class="wsd-quick"
        type="button"
        @click="openForm(q.formKey)"
      >
        <span class="wsd-quick__label">{{ q.label }}</span>
      </button>
      <button class="wsd-quick" type="button" @click="gearClick">
        <span class="wsd-quick__label">{{ t('workspace.moreItems') }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.wsd-panel {
  box-sizing: border-box;
  padding: 16px 20px 20px;
  background: #ffffff;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
}
.wsd-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wsd-panel__head .wsd-pill {
  margin-right: 0;
}
.wsd-panel__title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-panel__empty {
  margin: 18px 0 0;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-pill {
  height: auto;
  padding: 0;
  margin-top: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-size: 14px;
  color: var(--sw-color-primary);
  cursor: pointer;
}
/* 3:2（执行提示17）：瓦片两行垂直几何——首行 y335/h32、次行 y399（行距 32） */
.wsd-quickgrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 32px 16px;
  margin-top: 34px;
}
.wsd-quick__label {
  width: 100%;
  line-height: 20px;
  text-align: center;
}
.wsd-quick {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: 6px;
  background: #ffffff;
  font-size: 14px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-quick:hover {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
}
</style>

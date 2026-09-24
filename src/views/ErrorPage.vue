<script setup lang="ts">
import { useI18n } from '@/locales'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

/**
 * 统一错误页（403/404/500，V011-BUG-021）：
 * 给出显式返回动作——有浏览历史则返回上一页，否则回工作台；另提供直达工作台入口。
 */
function goBack(): void {
  if (globalThis.history.length > 1) router.back()
  else void router.replace('/workspace')
}
</script>

<template>
  <div class="error-page">
    <h1>{{ route.meta.errorCode }}</h1>
    <p>{{ route.meta.title ?? t('view.errorTitle') }}</p>
    <p v-if="route.meta.errorCode === 404" class="error-page__hint">
      {{ t('view.errorPageMissing') }}
    </p>
    <div class="error-page__actions">
      <button class="error-page__btn error-page__btn--primary" type="button" @click="goBack">
        {{ t('view.errorGoBack') }}
      </button>
      <button class="error-page__btn" type="button" @click="router.replace('/workspace')">
        {{ t('view.errorBackToWorkspace') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 8px;
}
.error-page h1 {
  font-size: 64px;
  margin: 0;
  color: #999;
}
.error-page__hint {
  margin: 0;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}
.error-page__actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.error-page__btn {
  box-sizing: border-box;
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--sw-border-base, #dcdfe6);
  border-radius: var(--sw-radius-base, 4px);
  background: #ffffff;
  font-size: 14px;
  color: var(--sw-text-primary, #303133);
  cursor: pointer;
}
.error-page__btn--primary {
  border-color: var(--sw-color-primary);
  background: var(--sw-color-primary);
  color: #ffffff;
}
.error-page__btn--primary:hover {
  background: var(--sw-color-primary-dark, #652656);
}
</style>

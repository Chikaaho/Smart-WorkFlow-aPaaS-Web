<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LoadErrorState } from '@/components/page-layout'
import AppIcon from '@/modules/form/components/AppIcon.vue'
import { listAppCenterApps } from '@/modules/form/api/app-center'
import type { FormApp } from '@/contracts/app-center'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'

/**
 * 应用中心（用户端）：展示当前用户可见的应用（启用 + 可见范围命中），
 * 点击进入应用查看已配置的目录与可用表单。可见性只决定展示，
 * 数据读取仍按既有 form:data:query 与行权限（本页不放大任何数据范围）。
 */
const { t } = useI18n()
const router = useRouter()

const apps = ref<FormApp[]>([])
const loading = ref(false)
const loadError = ref<ApiError | null>(null)
const errorMsg = ref('')

const isEmpty = computed(
  () => !loading.value && !loadError.value && !errorMsg.value && apps.value.length === 0,
)

async function load() {
  loading.value = true
  loadError.value = null
  errorMsg.value = ''
  try {
    apps.value = await listAppCenterApps()
  } catch (err: unknown) {
    loadError.value = err instanceof ApiError ? err : null
    errorMsg.value = loadError.value ? '' : t('form.appCenter.loadFailed', { msg: String(err) })
    apps.value = []
  } finally {
    loading.value = false
  }
}

function enterApp(app: FormApp) {
  void router.push({ name: 'form-app-center-detail', params: { appId: app.id } })
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="app-center">
    <div class="app-center__head">
      <h1 class="app-center__title">{{ t('form.appCenter.centerTitle') }}</h1>
      <p class="app-center__subtitle">{{ t('form.appCenter.centerSubtitle') }}</p>
    </div>

    <LoadErrorState v-if="loadError" :error="loadError" @retry="load" />
    <div v-else-if="errorMsg" class="app-center__error">{{ errorMsg }}</div>

    <div v-else v-loading="loading" class="app-center__grid">
      <button
        v-for="app in apps"
        :key="app.id"
        type="button"
        class="app-card"
        data-testid="app-card"
        @click="enterApp(app)"
      >
        <AppIcon :icon="app.icon" :color="app.color" :size="20" />
        <div class="app-card__body">
          <span class="app-card__name" data-testid="app-card-name">{{ app.name }}</span>
          <span class="app-card__meta">
            {{ t('form.appCenter.formCount', { count: app.formCount ?? 0 }) }}
          </span>
        </div>
      </button>

      <div v-if="isEmpty" class="app-center__empty" data-testid="app-center-empty">
        <p>{{ t('form.appCenter.emptyApps') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-center {
  padding: 20px 24px;
}
.app-center__head {
  margin-bottom: 16px;
}
.app-center__title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 4px;
}
.app-center__subtitle {
  font-size: 13px;
  color: #909399;
  margin: 0;
}
.app-center__error {
  color: #f56c6c;
}
.app-center__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  min-height: 120px;
}
.app-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: box-shadow 0.2s;
}
.app-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.app-card__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.app-card__name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-card__meta {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}
.app-center__empty {
  grid-column: 1 / -1;
  color: #909399;
  text-align: center;
  padding: 48px 0;
}
</style>

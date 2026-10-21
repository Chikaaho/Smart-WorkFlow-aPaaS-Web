<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LoadErrorState } from '@/components/page-layout'
import AppGrid from '@/modules/form/components/AppGrid.vue'
import AppGridToolbar from '@/modules/form/components/AppGridToolbar.vue'
import AppPerRowSetting from '@/modules/form/components/AppPerRowSetting.vue'
import { useAppPerRow } from '@/modules/form/components/useAppPerRow'
import { listAppCenterApps } from '@/modules/form/api/app-center'
import type { FormApp } from '@/contracts/app-center'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'

/**
 * 应用中心（用户端）：展示当前用户可见的应用（启用 + 可见范围命中），
 * 点击进入应用查看已配置的目录与可用表单。可见性只决定展示，
 * 数据读取仍按既有 form:data:query 与行权限（本页不放大任何数据范围）。
 *
 * 原型（Owner 2026-10-16）：顶部「搜索应用」+ 每行数量设置；下方应用卡片网格。
 */
const { t } = useI18n()
const router = useRouter()

/** 每行应用数量偏好（仅本机个人偏好，不落服务端；隐私模式读不到时用默认值）。 */
const { perRow, options: perRowOptions } = useAppPerRow()

const apps = ref<FormApp[]>([])
const loading = ref(false)
const loadError = ref<ApiError | null>(null)
const errorMsg = ref('')
const keyword = ref('')

const filteredApps = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return apps.value
  return apps.value.filter((app) => app.name.toLowerCase().includes(key))
})

const emptyText = computed(() =>
  apps.value.length > 0 ? t('form.appCenter.searchAppEmpty') : t('form.appCenter.emptyApps'),
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
    <AppGridToolbar
      v-model="keyword"
      :placeholder="t('form.appCenter.appSearchPlaceholder')"
      test-id="app-center-search"
    >
      <template #actions>
        <AppPerRowSetting v-model="perRow" :options="perRowOptions" />
      </template>
    </AppGridToolbar>

    <LoadErrorState v-if="loadError" :error="loadError" @retry="load" />
    <div v-else-if="errorMsg" class="app-center__error">{{ errorMsg }}</div>

    <AppGrid
      v-else
      :apps="filteredApps"
      :loading="loading"
      :per-row="perRow"
      show-form-count
      @select="enterApp"
    >
      <template #empty>
        <div data-testid="app-center-empty">
          <p>{{ emptyText }}</p>
        </div>
      </template>
    </AppGrid>
  </div>
</template>

<style scoped>
.app-center {
  padding: 12px 16px 8px;
}
.app-center__error {
  color: #f56c6c;
}
</style>

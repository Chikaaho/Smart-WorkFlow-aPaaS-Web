<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Menu } from '@element-plus/icons-vue'
import { LoadErrorState } from '@/components/page-layout'
import AppGrid from '@/modules/form/components/AppGrid.vue'
import AppGridToolbar from '@/modules/form/components/AppGridToolbar.vue'
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
const PER_ROW_KEY = 'sw:app-center:per-row'
const PER_ROW_OPTIONS = [3, 4, 5, 6, 8] as const
const PER_ROW_DEFAULT = 6

function readPerRow(): number {
  const raw = globalThis.localStorage?.getItem(PER_ROW_KEY)
  const parsed = raw ? Number(raw) : NaN
  return (PER_ROW_OPTIONS as readonly number[]).includes(parsed) ? parsed : PER_ROW_DEFAULT
}

const apps = ref<FormApp[]>([])
const loading = ref(false)
const loadError = ref<ApiError | null>(null)
const errorMsg = ref('')
const keyword = ref('')
const perRow = ref<number>(readPerRow())

const filteredApps = computed(() => {
  const key = keyword.value.trim().toLowerCase()
  if (!key) return apps.value
  return apps.value.filter((app) => app.name.toLowerCase().includes(key))
})

const emptyText = computed(() =>
  apps.value.length > 0 ? t('form.appCenter.searchAppEmpty') : t('form.appCenter.emptyApps'),
)

watch(perRow, (value) => {
  globalThis.localStorage?.setItem(PER_ROW_KEY, String(value))
})

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
        <el-popover placement="bottom-end" :width="220" trigger="click">
          <template #reference>
            <el-button
              class="app-center__settings"
              data-testid="app-center-per-row"
              :icon="Menu"
              :title="t('form.appCenter.perRowSettingHint')"
            />
          </template>
          <div class="app-center__settings-panel" data-testid="app-center-per-row-panel">
            <p class="app-center__settings-title">{{ t('form.appCenter.perRowSettings') }}</p>
            <el-radio-group v-model="perRow" size="small">
              <el-radio-button v-for="n in PER_ROW_OPTIONS" :key="n" :value="n">
                {{ n }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </el-popover>
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
.app-center__settings {
  flex: 0 0 auto;
}
.app-center__settings-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.app-center__settings-title {
  margin: 0;
  font-size: 13px;
  color: #606266;
}
.app-center__error {
  color: #f56c6c;
}
</style>

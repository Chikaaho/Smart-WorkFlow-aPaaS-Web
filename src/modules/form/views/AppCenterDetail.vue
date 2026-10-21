<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import AppFormData from '@/modules/form/views/AppFormData.vue'
import AppTreeNav from '@/modules/form/components/AppTreeNav.vue'
import { getAppCenterContent } from '@/modules/form/api/app-center'
import type { FormAppContent, FormAppFormItem } from '@/contracts/app-center'
import { useI18n } from '@/locales'
import { getErrorMessage } from '@/foundation/request/error-code-map'

/**
 * 应用中心 · 应用内页（用户端，原型 2026-10-16）：
 * 左侧是该应用的目录/表单导航（目录 + 目录内表单，应用内直接归属表单平级），
 * 右侧直接展示所选表单的数据列表（搜索、表头设置、分页），无需再跳页。
 * 选中表单写入路由 query（formKey），刷新后保持同一表单；「返回应用中心」回应用列表。
 * 未发布/停用/不可见表单由服务端过滤（本页不展示受限对象）。
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const appId = computed(() => String(route.params.appId ?? ''))
const content = ref<FormAppContent | null>(null)
const loading = ref(false)
const errorMsg = ref('')

const dirs = computed(() => content.value?.dirs ?? [])
const directForms = computed(() => content.value?.directForms ?? [])
const allForms = computed<FormAppFormItem[]>(() => {
  const forms: FormAppFormItem[] = []
  for (const dir of dirs.value) forms.push(...(dir.forms ?? []))
  forms.push(...directForms.value)
  return forms
})
const isEmpty = computed(() => !loading.value && !errorMsg.value && allForms.value.length === 0)

/** 当前选中表单：路由 query.formKey 命中则用之，否则回落首个可查看表单。 */
const selectedFormKey = computed(() => {
  const fromQuery = typeof route.query.formKey === 'string' ? route.query.formKey : ''
  if (fromQuery && allForms.value.some((f) => f.formKey === fromQuery)) return fromQuery
  return allForms.value[0]?.formKey ?? ''
})

function selectForm(item: FormAppFormItem) {
  if (item.formKey === selectedFormKey.value) return
  void router.replace({ query: { ...route.query, formKey: item.formKey } })
}

function backToCenter() {
  void router.push({ name: 'form-app-center' })
}

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    content.value = await getAppCenterContent(appId.value)
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    errorMsg.value = getErrorMessage(errObj.code ?? 0, errObj.message)
    content.value = null
  } finally {
    loading.value = false
  }
}

/** 目录/应用被后台调整后（换应用或刷新）回到首个可选表单，避免停留在已移除的表单上。 */
watch(allForms, (forms) => {
  const fromQuery = typeof route.query.formKey === 'string' ? route.query.formKey : ''
  if (fromQuery && !forms.some((f) => f.formKey === fromQuery)) {
    void router.replace({ query: { ...route.query, formKey: forms[0]?.formKey ?? undefined } })
  }
})

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="app-detail">
    <div v-if="errorMsg" class="app-detail__error">{{ errorMsg }}</div>

    <div v-else v-loading="loading" class="app-detail__body">
      <AppTreeNav
        :dirs="dirs"
        :direct-forms="directForms"
        :selected-form-key="selectedFormKey"
        @select="selectForm"
      >
        <template #header>
          <div class="app-detail__head">
            <!-- 0.1.7 #22/#25：左上角圆角返回箭头，应用名等左上角噪音全部去除 -->
            <button
              type="button"
              class="app-detail__back"
              data-testid="app-detail-back"
              :title="t('common.backShort')"
              @click="backToCenter"
            >
              <el-icon><ArrowLeft /></el-icon>
            </button>
          </div>
        </template>
      </AppTreeNav>

      <section class="app-detail__panel">
        <p v-if="isEmpty" class="app-detail__empty" data-testid="app-detail-empty">
          {{ t('form.appCenter.emptyAppContent') }}
        </p>
        <AppFormData
          v-else-if="selectedFormKey"
          :key="selectedFormKey"
          :form-key="selectedFormKey"
          :app-id="appId"
          embedded
        />
        <p v-else class="app-detail__empty">{{ t('form.appCenter.pickForm') }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.app-detail {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.app-detail__head {
  display: flex;
  align-items: center;
  padding: 10px 16px 0;
}
.app-detail__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--sw-border-base, #dcdfe6);
  border-radius: 50%;
  background: #fff;
  color: var(--sw-text-regular, #606266);
  cursor: pointer;
}
.app-detail__back:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-7, #c6e2ff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
.app-detail__error {
  color: #f56c6c;
  padding: 0 24px;
}
.app-detail__body {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-height: 0;
  gap: 0;
}
/* 左侧目录/表单树由 AppTreeNav 统一维护 */
.app-detail__panel {
  flex: 1;
  min-width: 0;
}
.app-detail__empty {
  color: #909399;
  text-align: center;
  padding: 48px 0;
  flex: 1;
}
</style>

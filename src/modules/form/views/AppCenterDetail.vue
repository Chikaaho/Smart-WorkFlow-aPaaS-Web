<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppContentPanel from '@/modules/form/components/AppContentPanel.vue'
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
        :app-name="content?.app?.name"
        :app-icon="content?.app?.icon"
        :app-color="content?.app?.color"
        :back-title="t('form.appCenter.backToList')"
        back-test-id="app-detail-back"
        name-test-id="app-detail-name"
        @select="selectForm"
        @back="backToCenter"
      />

      <AppContentPanel
        :form-key="selectedFormKey"
        :app-id="appId"
        :is-empty="isEmpty"
        empty-test-id="app-detail-empty"
        placeholder-test-id="app-detail-placeholder"
      />
    </div>
  </div>
</template>

<style scoped>
.app-detail {
  display: flex;
  flex-direction: column;
  min-height: 100%;
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
</style>

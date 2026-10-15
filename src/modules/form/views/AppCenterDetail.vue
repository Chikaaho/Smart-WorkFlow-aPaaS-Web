<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/modules/form/components/AppIcon.vue'
import { getAppCenterContent } from '@/modules/form/api/app-center'
import type { FormAppContent, FormAppFormItem } from '@/contracts/app-center'
import { useI18n } from '@/locales'
import { getErrorMessage } from '@/foundation/request/error-code-map'

/**
 * 应用中心 · 应用内容（用户端）：
 * 展示后台已配置的目录（二级分类）与应用内直接归属表单；点击表单进入其数据列表。
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
const totalForms = computed(
  () => dirs.value.reduce((acc, d) => acc + (d.forms?.length ?? 0), 0) + directForms.value.length,
)
const isEmpty = computed(
  () => !loading.value && !errorMsg.value && totalForms.value === 0 && dirs.value.length === 0,
)

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

function openForm(item: FormAppFormItem) {
  void router.push({
    name: 'app-form-data',
    params: { formKey: item.formKey },
    query: { appId: appId.value },
  })
}

function backToCenter() {
  void router.push({ name: 'form-app-center' })
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="app-detail">
    <div class="app-detail__head">
      <AppIcon v-if="content" :icon="content.app.icon" :color="content.app.color" :size="18" />
      <h1 class="app-detail__title" data-testid="app-detail-name">
        {{ content?.app.name ?? t('form.appCenter.centerTitle') }}
      </h1>
      <el-button class="app-detail__back" @click="backToCenter">
        {{ t('form.appCenter.backToCenter') }}
      </el-button>
    </div>

    <div v-if="errorMsg" class="app-detail__error">{{ errorMsg }}</div>

    <div v-else v-loading="loading" class="app-detail__body">
      <section v-for="dir in dirs" :key="dir.id" class="entry-section">
        <h2 class="entry-section__title" data-testid="center-dir-name">{{ dir.name }}</h2>
        <div v-if="(dir.forms?.length ?? 0) > 0" class="entry-grid">
          <button
            v-for="item in dir.forms ?? []"
            :key="item.formId"
            type="button"
            class="entry-card"
            data-testid="center-form-card"
            @click="openForm(item)"
          >
            {{ item.name }}
          </button>
        </div>
        <p v-else class="entry-section__empty">{{ t('form.appCenter.emptyDir') }}</p>
      </section>

      <section class="entry-section">
        <h2 class="entry-section__title">{{ t('form.appCenter.directForms') }}</h2>
        <div v-if="directForms.length > 0" class="entry-grid">
          <button
            v-for="item in directForms"
            :key="item.formId"
            type="button"
            class="entry-card"
            data-testid="center-form-card"
            @click="openForm(item)"
          >
            {{ item.name }}
          </button>
        </div>
        <p v-else class="entry-section__empty">{{ t('form.appCenter.emptyDirect') }}</p>
      </section>

      <div v-if="isEmpty" class="app-detail__empty" data-testid="app-detail-empty">
        {{ t('form.appCenter.emptyAppContent') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-detail {
  padding: 20px 24px;
}
.app-detail__head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.app-detail__title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}
.app-detail__back {
  margin-left: auto;
}
.app-detail__error {
  color: #f56c6c;
}
.app-detail__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 120px;
}
.entry-section__title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 10px;
}
.entry-section__empty {
  font-size: 13px;
  color: #909399;
  margin: 0;
}
.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.entry-card {
  padding: 14px 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  color: #303133;
  transition: box-shadow 0.2s;
}
.entry-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.app-detail__empty {
  color: #909399;
  text-align: center;
  padding: 32px 0;
}
</style>

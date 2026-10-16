<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Folder } from '@element-plus/icons-vue'
import AppIcon from '@/modules/form/components/AppIcon.vue'
import AppFormData from '@/modules/form/views/AppFormData.vue'
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
    <div class="app-detail__head">
      <AppIcon v-if="content" :icon="content.app.icon" :color="content.app.color" :size="18" />
      <h1 class="app-detail__title" data-testid="app-detail-name">
        {{ content?.app.name ?? t('form.appCenter.centerTitle') }}
      </h1>
      <el-button class="app-detail__back" data-testid="app-detail-back" @click="backToCenter">
        {{ t('form.appCenter.backToCenter') }}
      </el-button>
    </div>

    <div v-if="errorMsg" class="app-detail__error">{{ errorMsg }}</div>

    <div v-else v-loading="loading" class="app-detail__body">
      <p v-if="isEmpty" class="app-detail__empty" data-testid="app-detail-empty">
        {{ t('form.appCenter.emptyAppContent') }}
      </p>

      <template v-else>
        <nav class="app-tree" :aria-label="t('form.appCenter.appNavTitle')">
          <template v-for="dir in dirs" :key="dir.id">
            <p class="app-tree__dir" data-testid="app-tree-dir">
              <el-icon class="app-tree__dir-icon"><Folder /></el-icon>
              {{ dir.name }}
            </p>
            <button
              v-for="item in dir.forms ?? []"
              :key="item.formId"
              type="button"
              class="app-tree__form"
              :class="{ 'is-active': item.formKey === selectedFormKey }"
              data-testid="app-tree-form"
              :data-form-key="item.formKey"
              @click="selectForm(item)"
            >
              {{ item.name }}
            </button>
            <p v-if="(dir.forms?.length ?? 0) === 0" class="app-tree__empty">
              {{ t('form.appCenter.emptyDir') }}
            </p>
          </template>

          <button
            v-for="item in directForms"
            :key="item.formId"
            type="button"
            class="app-tree__form app-tree__form--root"
            :class="{ 'is-active': item.formKey === selectedFormKey }"
            data-testid="app-tree-form"
            :data-form-key="item.formKey"
            @click="selectForm(item)"
          >
            {{ item.name }}
          </button>
        </nav>

        <section class="app-detail__panel">
          <AppFormData
            v-if="selectedFormKey"
            :key="selectedFormKey"
            :form-key="selectedFormKey"
            :app-id="appId"
            embedded
          />
          <p v-else class="app-detail__empty">{{ t('form.appCenter.pickForm') }}</p>
        </section>
      </template>
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
  gap: 12px;
  padding: 20px 24px 12px;
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
  padding: 0 24px;
}
.app-detail__body {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-height: 0;
  gap: 0;
}
/* 左侧：目录/表单导航（原型：目录 → 目录内表单缩进，直接归属表单平级；
   Owner 2026-10-16 裁决：本栏全白底纹） */
.app-tree {
  flex: 0 0 220px;
  width: 220px;
  padding: 8px 12px 24px;
  background: #ffffff;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.app-tree__dir {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.app-tree__dir:first-child {
  margin-top: 0;
}
.app-tree__dir-icon {
  color: #909399;
}
.app-tree__form {
  display: block;
  width: 100%;
  padding: 7px 10px 7px 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
}
.app-tree__form--root {
  padding-left: 10px;
  margin-top: 2px;
}
.app-tree__form:hover {
  background: #f5f7fa;
  color: #303133;
}
.app-tree__form.is-active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 500;
}
.app-tree__empty {
  margin: 0 0 0 22px;
  font-size: 12px;
  color: #c0c4cc;
}
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

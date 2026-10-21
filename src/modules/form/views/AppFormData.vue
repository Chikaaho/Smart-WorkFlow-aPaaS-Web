<script setup lang="ts">
/**
 * 用户端应用数据页 —— 仅提供返回外壳，列表实现统一由 FormDataList 承载。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import FormDataList from '@/modules/form/components/FormDataList.vue'
import { useI18n } from '@/locales'

const props = withDefaults(
  defineProps<{
    /** 表单业务标识；缺省取路由参数 */
    formKey?: string
    /** 来源应用 ID（决定返回目标）；缺省取路由 query.appId */
    appId?: string
    /** 嵌入应用内页时为 true：返回入口由应用内页统一提供 */
    embedded?: boolean
  }>(),
  { formKey: undefined, appId: undefined, embedded: false },
)

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const formKey = computed(() => props.formKey ?? String(route.params.formKey ?? ''))
const appId = computed(
  () => props.appId ?? (typeof route.query.appId === 'string' ? route.query.appId : ''),
)

function backToApp() {
  if (appId.value) {
    void router.push({ name: 'form-app-center-detail', params: { appId: appId.value } })
  } else {
    void router.push({ name: 'form-app-center' })
  }
}
</script>

<template>
  <div class="afd">
    <div v-if="!embedded" class="afd__back-row">
      <button
        type="button"
        class="afd__back"
        data-testid="form-data-back"
        :title="t('common.backShort')"
        @click="backToApp"
      >
        <el-icon><ArrowLeft /></el-icon>
      </button>
    </div>
    <FormDataList :form-key="formKey" />
  </div>
</template>

<style scoped>
.afd__back-row {
  padding: 8px 16px 0;
}

.afd__back {
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

.afd__back:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-7, #c6e2ff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
</style>

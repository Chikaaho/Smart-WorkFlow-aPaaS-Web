<script setup lang="ts">
/**
 * AppContentPanel — 应用内右侧内容区唯一实现。
 *
 * 管理端应用工作台与用户端应用内页共用：空应用、未选表单、选中表单的数据列表
 * 三种状态使用同一套占位与容器，避免两端空态/间距各写一份。
 */
import AppFormData from '@/modules/form/views/AppFormData.vue'
import { useI18n } from '@/locales'

withDefaults(
  defineProps<{
    formKey: string
    appId: string
    isEmpty: boolean
    emptyTestId?: string
    placeholderTestId?: string
  }>(),
  {
    emptyTestId: 'app-content-empty',
    placeholderTestId: 'app-content-placeholder',
  },
)

const { t } = useI18n()
</script>

<template>
  <section class="app-content-panel">
    <el-empty
      v-if="isEmpty"
      class="app-content-panel__placeholder"
      :data-testid="emptyTestId"
      :image-size="120"
      :description="t('form.appCenter.emptyAppContent')"
    />
    <AppFormData v-else-if="formKey" :key="formKey" :form-key="formKey" :app-id="appId" embedded />
    <el-empty
      v-else
      class="app-content-panel__placeholder"
      :image-size="120"
      :data-testid="placeholderTestId"
    >
      <template #description>
        <p class="app-content-panel__title">{{ t('common.noContent') }}</p>
        <p class="app-content-panel__hint">{{ t('form.appCenter.pickForm') }}</p>
      </template>
    </el-empty>
  </section>
</template>

<style scoped>
.app-content-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.app-content-panel__placeholder {
  flex: 1;
  justify-content: center;
}

.app-content-panel__title {
  margin: 0;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.app-content-panel__hint {
  margin: 4px 0 0;
  color: #909399;
  font-size: 13px;
}
</style>

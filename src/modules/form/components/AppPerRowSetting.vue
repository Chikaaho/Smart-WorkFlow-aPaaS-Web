<script setup lang="ts">
/**
 * AppPerRowSetting — 应用卡片网格「每行数量」设置入口。
 * 管理端应用管理与用户端应用中心共用。
 */
import { Menu } from '@element-plus/icons-vue'
import { useI18n } from '@/locales'

defineProps<{
  modelValue: number
  options: readonly number[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const { t } = useI18n()
</script>

<template>
  <el-popover
    placement="bottom-end"
    :width="350"
    trigger="click"
    popper-class="app-per-row-popover"
    :show-arrow="false"
  >
    <template #reference>
      <el-button
        class="app-per-row__trigger"
        data-testid="app-per-row"
        :icon="Menu"
        :title="t('form.appCenter.perRowSettingHint')"
        :aria-label="t('form.appCenter.perRowSettings')"
      />
    </template>
    <div class="app-per-row" data-testid="app-per-row-panel">
      <p class="app-per-row__title">{{ t('form.appCenter.perRowSettings') }}</p>
      <el-radio-group
        :model-value="modelValue"
        @update:model-value="emit('update:modelValue', Number($event))"
      >
        <el-radio-button v-for="n in options" :key="n" :value="n">{{ n }}</el-radio-button>
      </el-radio-group>
    </div>
  </el-popover>
</template>

<style scoped>
.app-per-row__trigger {
  flex: 0 0 auto;
}
.app-per-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.app-per-row__title {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: var(--sw-font-body);
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 22px;
}
.app-per-row :deep(.el-radio-group) {
  display: flex;
  flex-wrap: nowrap;
  gap: var(--sw-space-8);
}
.app-per-row :deep(.el-radio-button__inner) {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  box-shadow: none;
}
</style>
<style>
.el-popper.app-per-row-popover {
  box-sizing: border-box;
  height: 102px;
  padding: 12px 16px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
}
</style>

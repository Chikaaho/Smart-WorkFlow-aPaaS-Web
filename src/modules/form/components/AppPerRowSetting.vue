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
  <el-popover placement="bottom-end" :width="220" trigger="click">
    <template #reference>
      <el-button
        class="app-per-row__trigger"
        data-testid="app-per-row"
        :icon="Menu"
        :title="t('form.appCenter.perRowSettingHint')"
      />
    </template>
    <div class="app-per-row" data-testid="app-per-row-panel">
      <p class="app-per-row__title">{{ t('form.appCenter.perRowSettings') }}</p>
      <el-radio-group
        :model-value="modelValue"
        size="small"
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
  color: #606266;
  font-size: 13px;
}
</style>

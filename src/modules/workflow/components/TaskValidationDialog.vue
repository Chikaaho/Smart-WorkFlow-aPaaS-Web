<script setup lang="ts">
import { useI18n } from '@/locales'

/**
 * TaskValidationDialog — 校验提示弹窗（设计 300:1808）。
 *
 * 提交前必填缺失聚合为清单（红条目 + 说明行），确认关闭。
 */
defineProps<{
  items: string[]
}>()

const visible = defineModel<boolean>({ required: true })

const { t } = useI18n()
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('workflow.validationDialogTitle')"
    width="480px"
    data-testid="validation-dialog"
  >
    <p class="validation-dialog__hint">{{ t('workflow.validationDialogHint') }}</p>
    <ul class="validation-dialog__list">
      <li
        v-for="(item, index) in items"
        :key="index"
        class="validation-dialog__item"
        data-testid="validation-item"
      >
        <span class="validation-dialog__icon" aria-hidden="true">!</span>
        <span>{{ item }}</span>
      </li>
    </ul>
    <template #footer>
      <el-button type="primary" @click="visible = false">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.validation-dialog__hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}
.validation-dialog__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.validation-dialog__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fef0f0;
  color: #ef5d71;
  font-size: 13px;
}
.validation-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 11px;
  font-weight: 600;
  flex: 0 0 auto;
}
</style>

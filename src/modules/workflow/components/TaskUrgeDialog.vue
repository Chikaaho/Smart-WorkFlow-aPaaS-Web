<script setup lang="ts">
import { useI18n } from '@/locales'

/**
 * TaskUrgeDialog — 催办弹窗（设计 273:2025）。
 *
 * 说明 + 催办留言（可空，服务端限 200 字）+ 可选接收人（排除自己）；
 * 与转办等同构 640 宽 / 80×32 底栏。
 */
defineProps<{
  recipientOptions: Array<{ id: string; name: string }>
}>()

const visible = defineModel<boolean>({ required: true })
const recipientIds = defineModel<string[]>('recipientIds', { required: true })
const message = defineModel<string>('message', { required: true })

const emit = defineEmits<{
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('workflow.urgeDialogTitle')"
    width="640px"
    class="action-dialog"
    :close-on-click-modal="false"
    data-testid="urge-dialog"
  >
    <p class="urge-dialog__hint">{{ t('workflow.urgeDialogHint') }}</p>
    <el-form label-position="top" @submit.prevent>
      <el-form-item v-if="recipientOptions.length > 0" :label="t('workflow.urgeRecipientsLabel')">
        <el-checkbox-group v-model="recipientIds" data-testid="urge-recipients">
          <el-checkbox v-for="user in recipientOptions" :key="user.id" :value="user.id">
            {{ user.name }}
          </el-checkbox>
        </el-checkbox-group>
        <small class="urge-dialog__hint">{{ t('workflow.urgeRecipientsHint') }}</small>
      </el-form-item>
      <el-form-item :label="t('workflow.urgeMessageLabel')">
        <el-input
          v-model="message"
          type="textarea"
          :rows="3"
          maxlength="200"
          :placeholder="t('workflow.urgeMessagePlaceholder')"
          data-testid="urge-message-input"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" data-testid="urge-confirm" @click="emit('confirm')">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.urge-dialog__hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}
</style>

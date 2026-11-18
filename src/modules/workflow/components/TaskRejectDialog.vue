<script setup lang="ts">
import { useI18n } from '@/locales'

/**
 * TaskRejectDialog — 驳回申请弹窗（设计 272:1746）。
 *
 * 驳回原因可选，确认后直提；560 宽 / 输入 510×32 / 底栏按钮 80×32。
 */
defineProps<{
  submitting: boolean
}>()

const visible = defineModel<boolean>({ required: true })
const reason = defineModel<string>('reason', { required: true })

const emit = defineEmits<{
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('workflow.rejectDialogTitle')"
    width="560px"
    class="reject-dialog"
    :close-on-click-modal="false"
    data-testid="reject-dialog"
  >
    <el-form label-position="top" @submit.prevent>
      <el-form-item :label="t('workflow.rejectReasonLabel')">
        <el-input
          v-model="reason"
          :placeholder="t('workflow.rejectReasonPlaceholder')"
          data-testid="reject-reason-input"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="submitting" @click="visible = false">
        {{ t('common.cancel') }}
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        data-testid="reject-confirm"
        @click="emit('confirm')"
      >
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

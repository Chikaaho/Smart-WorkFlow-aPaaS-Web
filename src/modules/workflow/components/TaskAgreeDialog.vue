<script setup lang="ts">
import { useI18n } from '@/locales'

/**
 * TaskAgreeDialog — 同意申请弹窗（设计 272:1767）。
 *
 * 560 宽 / 用户语言确认句 / 底栏 取消·确定 80×32；打开后取消即关闭，不提交同意。
 */
defineProps<{
  submitting: boolean
}>()

const visible = defineModel<boolean>({ required: true })

const emit = defineEmits<{
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('workflow.agreeDialogTitle')"
    width="560px"
    class="agree-dialog"
    :close-on-click-modal="false"
    data-testid="agree-dialog"
  >
    <p class="agree-dialog__message">{{ t('workflow.agreeDialogMessage') }}</p>
    <template #footer>
      <el-button :disabled="submitting" @click="visible = false">
        {{ t('common.cancel') }}
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        data-testid="agree-confirm"
        @click="emit('confirm')"
      >
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.agree-dialog__message {
  margin: 0;
  color: #303133;
  font-size: 14px;
  line-height: 22px;
}
</style>

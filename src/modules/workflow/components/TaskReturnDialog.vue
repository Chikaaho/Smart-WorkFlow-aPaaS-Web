<script setup lang="ts">
import { useI18n } from '@/locales'
import type { ApprovalHistoryItem } from '@/contracts/bpm'

/**
 * TaskReturnDialog — 退回申请弹窗（设计 273:2001）。
 *
 * 退回目标选择（说明行）+ 退回说明随 RETURN 命令提交；目标与说明由页面持有。
 */
defineProps<{
  targets: Array<ApprovalHistoryItem & { nodeKey: string }>
  submitting: boolean
}>()

const visible = defineModel<boolean>({ required: true })
const target = defineModel<string>('target', { required: true })
const comment = defineModel<string>('comment', { required: true })

const emit = defineEmits<{
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('workflow.returnDialogTitle')"
    width="550px"
    :close-on-click-modal="false"
    data-testid="return-dialog"
  >
    <el-form label-position="top" size="small" @submit.prevent>
      <el-form-item :label="t('workflow.returnTargetLabel')">
        <el-select
          v-model="target"
          :placeholder="t('workflow.selectApprovedNode')"
          style="width: 100%"
          data-testid="return-target-select"
        >
          <el-option
            v-for="item in targets"
            :key="item.nodeKey"
            :label="item.taskName"
            :value="item.nodeKey"
          />
        </el-select>
        <span class="return-dialog__hint">{{ t('workflow.returnRoundHint') }}</span>
      </el-form-item>
      <el-form-item :label="t('workflow.returnCommentLabel')">
        <el-input
          v-model="comment"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          data-testid="return-comment"
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
        data-testid="return-confirm"
        @click="emit('confirm')"
      >
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.return-dialog__hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--sw-text-secondary, #909399);
}
</style>

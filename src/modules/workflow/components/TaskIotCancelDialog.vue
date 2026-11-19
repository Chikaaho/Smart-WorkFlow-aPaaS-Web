<script setup lang="ts">
import { useI18n } from '@/locales'

/**
 * TaskIotCancelDialog — P63 取消 IoT 预约弹窗。
 *
 * 填原因 → 确认 → 按 outcome 提示成功/不可取消并刷新；原因与提交状态由页面持有。
 */
defineProps<{
  submitting: boolean
}>()

const visible = defineModel<boolean>({ required: true })
const reason = defineModel<string>('reason', { required: true })

const emit = defineEmits<{
  submitCancel: []
}>()

const { t } = useI18n()
</script>

<template>
  <!-- P63 取消预约弹窗：填原因 → 取消 → 按 outcome 提示成功/不可取消并刷新 -->
  <el-dialog v-model="visible" title="取消 IoT 预约" width="420px" :close-on-click-modal="false">
    <el-form label-position="top" size="small">
      <el-form-item label="取消原因" required>
        <el-input v-model="reason" type="textarea" :rows="3" placeholder="请填写取消原因" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="emit('submitCancel')">
        确认取消
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { changePassword, logout } from '@/foundation/auth'
import { useI18n } from '@/locales'
import DetailDialog from '@/components/DetailDialog.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: []
}>()

const { t } = useI18n()
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const submitting = ref(false)
const error = ref('')

function reset() {
  form.oldPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  error.value = ''
}

watch(
  () => props.modelValue,
  (show) => {
    if (show) reset()
  },
)

async function submit() {
  if (submitting.value) return
  if (!form.oldPassword) {
    error.value = t('auth.oldPasswordRequired')
    return
  }
  if (form.newPassword.length < 8) {
    error.value = t('auth.newPasswordLength')
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    error.value = t('auth.passwordMismatch')
    return
  }

  submitting.value = true
  error.value = ''
  try {
    await changePassword({
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    })
    await logout()
    ElMessage.success(t('auth.passwordChanged'))
    emit('changed')
  } catch (err) {
    error.value = err instanceof ApiError ? err.msg : t('auth.passwordChangeFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <DetailDialog
    v-model="visible"
    appearance="design"
    class="sw-password-dialog"
    :title="t('auth.changePassword')"
    width="520px"
    :error="error"
  >
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item :label="t('auth.oldPassword')" required>
        <el-input
          v-model="form.oldPassword"
          type="password"
          autocomplete="current-password"
          show-password
          :placeholder="t('auth.oldPasswordPlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="t('auth.newPassword')" required>
        <el-input
          v-model="form.newPassword"
          type="password"
          autocomplete="new-password"
          show-password
          :placeholder="t('auth.newPasswordPlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="t('auth.confirmPassword')" required>
        <el-input
          v-model="form.confirmPassword"
          type="password"
          autocomplete="new-password"
          show-password
          :placeholder="t('auth.confirmPasswordPlaceholder')"
          @keyup.enter="submit"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ t('common.modify') }}
      </el-button>
    </template>
  </DetailDialog>
</template>

<style>
/* 135:2（执行提示18）：浮层 520×354 居中；三输入 470×32、步长 72；底栏 80×32@y658 */
.sw-password-dialog.el-dialog {
  border-radius: 12px;
  padding-bottom: 26px;
}
.sw-password-dialog .el-dialog__header {
  margin-bottom: 15px;
}
.sw-password-dialog .el-form-item {
  margin-bottom: 11px;
}
.sw-password-dialog .el-form-item:last-child {
  margin-bottom: 0;
}
.sw-password-dialog .el-form-item__label {
  height: 22px;
  margin-bottom: 7px;
  padding: 0;
  color: var(--sw-text-regular, #606266);
  font-size: 13px;
  line-height: 22px;
}
.sw-password-dialog .el-input__wrapper {
  box-sizing: border-box;
  height: 32px;
}
.sw-password-dialog .el-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  height: 32px;
  margin-top: 18px;
  padding: 0;
}
.sw-password-dialog .el-dialog__footer .el-button {
  width: 80px;
  height: 32px;
  margin: 0;
}
</style>

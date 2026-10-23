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
        />
      </el-form-item>
      <el-form-item :label="t('auth.newPassword')" required>
        <el-input
          v-model="form.newPassword"
          type="password"
          autocomplete="new-password"
          show-password
        />
      </el-form-item>
      <el-form-item :label="t('auth.confirmPassword')" required>
        <el-input
          v-model="form.confirmPassword"
          type="password"
          autocomplete="new-password"
          show-password
          @keyup.enter="submit"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ t('common.save') }}
      </el-button>
    </template>
  </DetailDialog>
</template>
